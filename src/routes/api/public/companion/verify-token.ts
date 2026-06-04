import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Token",
};

async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/companion/verify-token")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const token = request.headers.get("x-device-token") ?? "";
          if (!/^[a-f0-9]{64}$/i.test(token)) {
            return Response.json({ error: "Ugyldigt nøgleformat" }, { status: 401, headers: CORS });
          }
          const tokenHash = await sha256Hex(token);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: tokenRow, error: tErr } = await supabaseAdmin
            .from("device_tokens")
            .select("id, user_id, name")
            .eq("token_hash", tokenHash)
            .maybeSingle();
          if (tErr) throw tErr;
          if (!tokenRow) {
            return Response.json({ error: "Ukendt nøgle" }, { status: 401, headers: CORS });
          }

          const { data: profile, error: pErr } = await supabaseAdmin
            .from("profiles")
            .select("id, display_name, lmu_name, approved")
            .eq("id", tokenRow.user_id)
            .maybeSingle();
          if (pErr) throw pErr;

          await supabaseAdmin
            .from("device_tokens")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", tokenRow.id);

          return Response.json(
            {
              user: {
                id: tokenRow.user_id,
                display_name: profile?.display_name ?? null,
                lmu_name: profile?.lmu_name ?? null,
                approved: !!profile?.approved,
              },
              token_name: tokenRow.name,
            },
            { status: 200, headers: CORS },
          );
        } catch (e) {
          console.error("[companion/verify-token]", e);
          return Response.json({ error: "Serverfejl" }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
