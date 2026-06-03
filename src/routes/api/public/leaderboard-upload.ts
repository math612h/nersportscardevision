import { createFileRoute } from "@tanstack/react-router";
import { parseLmuRaceFileServer } from "@/lib/lmu-parser-server";
import { normalizeCarClass, nameSimilarity } from "@/lib/lmu-parser";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Token",
};

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/leaderboard-upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const token = request.headers.get("x-device-token") ?? "";
          if (!/^[a-f0-9]{64}$/i.test(token)) {
            return Response.json({ error: "Mangler eller ugyldigt device-token" }, { status: 401, headers: CORS });
          }
          const tokenHash = await sha256Hex(token);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: tokenRow, error: tErr } = await supabaseAdmin
            .from("device_tokens")
            .select("id, user_id")
            .eq("token_hash", tokenHash)
            .maybeSingle();
          if (tErr) throw tErr;
          if (!tokenRow) {
            return Response.json({ error: "Ukendt device-token" }, { status: 401, headers: CORS });
          }

          const { data: profile, error: pErr } = await supabaseAdmin
            .from("profiles")
            .select("lmu_name, approved")
            .eq("id", tokenRow.user_id)
            .maybeSingle();
          if (pErr) throw pErr;
          if (!profile?.approved) {
            return Response.json({ error: "Profilen er ikke godkendt endnu" }, { status: 403, headers: CORS });
          }
          const lmuName = (profile.lmu_name ?? "").trim().toLowerCase();
          if (!lmuName) {
            return Response.json({ error: "LMU-navn mangler på profilen" }, { status: 400, headers: CORS });
          }

          const xml = await request.text();
          if (!xml || xml.length < 50) {
            return Response.json({ error: "Tom eller ugyldig fil" }, { status: 400, headers: CORS });
          }
          if (xml.length > 5_000_000) {
            return Response.json({ error: "Filen er for stor (max 5 MB)" }, { status: 413, headers: CORS });
          }

          let parsed;
          try {
            parsed = parseLmuRaceFileServer(xml);
          } catch (e: any) {
            return Response.json({ error: e?.message ?? "Kunne ikke læse filen" }, { status: 400, headers: CORS });
          }

          // Uploader must be present in the file (exact or fuzzy ≥85%)
          let me = parsed.drivers.find((d) => d.name.trim().toLowerCase() === lmuName);
          if (!me) {
            let bestScore = 0;
            for (const d of parsed.drivers) {
              const s = nameSimilarity(d.name, lmuName);
              if (s >= 0.85 && s > bestScore) { bestScore = s; me = d; }
            }
          }
          if (!me) {
            return Response.json(
              { inserted: 0, skipped: 0, note: "Du var ikke i filen — sprunget over" },
              { status: 200, headers: CORS },
            );
          }

          const { data: allProfiles, error: aErr } = await supabaseAdmin
            .from("profiles")
            .select("id, lmu_name")
            .not("lmu_name", "is", null);
          if (aErr) throw aErr;

          const skipped: string[] = [];
          const rows = parsed.drivers
            .filter((d) => d.bestLapMs != null)
            .map((d) => {
              const dn = d.name.trim().toLowerCase();
              let matchId: string | null = null;
              const exact = allProfiles!.find((p) => (p.lmu_name ?? "").trim().toLowerCase() === dn);
              if (exact) matchId = exact.id;
              else {
                let bestScore = 0;
                for (const p of allProfiles!) {
                  const s = nameSimilarity(d.name, p.lmu_name ?? "");
                  if (s >= 0.85 && s > bestScore) { bestScore = s; matchId = p.id; }
                }
              }
              if (!matchId) { skipped.push(d.name); return null; }
              return {
                user_id: matchId,
                driver_name: d.name,
                track: parsed.track,
                layout: parsed.layout,
                car_class: normalizeCarClass(d.carClass),
                car_model: d.carModel,
                best_lap_ms: d.bestLapMs as number,
                source: "user" as const,
                uploaded_by: tokenRow.user_id,
                recorded_at: parsed.recordedAt,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (rows.length > 0) {
            const { error: insErr } = await supabaseAdmin.from("leaderboard_times").insert(rows);
            if (insErr) throw insErr;
          }

          await supabaseAdmin
            .from("device_tokens")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", tokenRow.id);

          return Response.json(
            { inserted: rows.length, skipped: skipped.length, track: parsed.track, layout: parsed.layout },
            { status: 200, headers: CORS },
          );
        } catch (e: any) {
          console.error("[leaderboard-upload]", e);
          return Response.json({ error: "Der opstod en serverfejl. Prøv igen senere." }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
