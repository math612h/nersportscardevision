import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-endpoint: poster forrige uges vinder af "Ugens Overhaling" til Discord.
 * Idempotent via public.overtaking_discord_posts (unik pr. week_start).
 *
 * Kaldes af pg_cron mandag morgen (efter uge-skiftet).
 * Auth: apikey-header med anon key (Lovable-standard for /api/public/*).
 */
export const Route = createFileRoute("/api/public/hooks/post-overtaking-winner")({
  server: {
    handlers: {
      POST: async ({ request: _request }) => {
        try {
          const webhookUrl = process.env.DISCORD_OVERTAKING_WEBHOOK_URL;
          if (!webhookUrl) {
            return json({ ok: false, error: "webhook_not_configured" }, 500);
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Beregn forrige uges mandag (Europa/København). Cron kører mandag morgen CPH.
          const weekStart = previousWeekStartCopenhagen();

          // Er den allerede postet?
          const { data: existing, error: existingErr } = await supabaseAdmin
            .from("overtaking_discord_posts")
            .select("week_start")
            .eq("week_start", weekStart)
            .maybeSingle();
          if (existingErr) throw existingErr;
          if (existing) {
            return json({ ok: true, skipped: "already_posted", week_start: weekStart });
          }

          // Hent alle klip i ugen
          const { data: clips, error: clipsErr } = await supabaseAdmin
            .from("overtaking_clips")
            .select("id, user_id, youtube_id, youtube_url, title, created_at")
            .eq("week_start", weekStart);
          if (clipsErr) throw clipsErr;
          if (!clips || clips.length === 0) {
            return json({ ok: true, skipped: "no_clips", week_start: weekStart });
          }

          // Hent stemmer for ugen
          const { data: votes, error: votesErr } = await supabaseAdmin
            .from("overtaking_votes")
            .select("clip_id")
            .eq("week_start", weekStart);
          if (votesErr) throw votesErr;

          const voteCount = new Map<string, number>();
          for (const v of votes ?? []) {
            voteCount.set(v.clip_id, (voteCount.get(v.clip_id) ?? 0) + 1);
          }

          // Find vinderen (flest stemmer, tie-break: tidligst indsendt)
          const sorted = [...clips]
            .map((c) => ({ ...c, votes: voteCount.get(c.id) ?? 0 }))
            .sort((a, b) => {
              if (b.votes !== a.votes) return b.votes - a.votes;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
          const winner = sorted[0];
          if (!winner || winner.votes === 0) {
            return json({ ok: true, skipped: "no_votes", week_start: weekStart });
          }

          // Hent vinderens profil
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("display_name, lmu_name, avatar_url, discord_avatar_url")
            .eq("id", winner.user_id)
            .maybeSingle();

          const winnerName =
            profile?.display_name?.trim() ||
            profile?.lmu_name?.trim() ||
            "Ukendt kører";
          const avatarUrl = profile?.avatar_url || profile?.discord_avatar_url || null;

          const weekNo = getISOWeek(weekStart);
          const siteUrl = "https://lmudanmark.dk";
          const videoUrl = `https://www.youtube.com/watch?v=${winner.youtube_id}`;
          const thumbnail = `https://i.ytimg.com/vi/${winner.youtube_id}/maxresdefault.jpg`;

          const embed = {
            title: `🏆 Ugens Overhaling — Uge ${weekNo}`,
            description:
              `**${winnerName}** har vundet ugens afstemning med **${winner.votes}** ${
                winner.votes === 1 ? "stemme" : "stemmer"
              }.\n\n` +
              (winner.title ? `*${escapeMd(winner.title)}*\n\n` : "") +
              `[▶ Se klippet på YouTube](${videoUrl})`,
            url: `${siteUrl}/ugens-overhaling`,
            color: 0xE10600, // racing red
            image: { url: thumbnail },
            author: avatarUrl
              ? { name: winnerName, icon_url: avatarUrl }
              : { name: winnerName },
            footer: {
              text: "LMU Danmark · Ugens Overhaling",
            },
            timestamp: new Date().toISOString(),
          };

          const payload = {
            username: "LMU Danmark",
            embeds: [embed],
            components: [
              {
                type: 1,
                components: [
                  { type: 2, style: 5, label: "Se på YouTube", url: videoUrl },
                  { type: 2, style: 5, label: "Åbn på LMU Danmark", url: `${siteUrl}/ugens-overhaling` },
                ],
              },
            ],
          };

          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            const body = await res.text();
            console.error("Discord webhook failed", res.status, body);
            return json({ ok: false, error: "discord_failed", status: res.status, body }, 502);
          }

          // Log som postet
          const { error: insertErr } = await supabaseAdmin
            .from("overtaking_discord_posts")
            .insert({ week_start: weekStart, clip_id: winner.id });
          if (insertErr) {
            console.error("Failed to log discord post", insertErr);
          }

          return json({
            ok: true,
            posted: true,
            week_start: weekStart,
            winner: { name: winnerName, votes: winner.votes, clip_id: winner.id },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("post-overtaking-winner error", e);
          return json({ ok: false, error: msg }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Escape en meget lille del af Discord-markdown i titler. */
function escapeMd(s: string): string {
  return s.replace(/([*_`~|>])/g, "\\$1").slice(0, 240);
}

/** Returnerer forrige uges mandag som YYYY-MM-DD i Europa/København. */
function previousWeekStartCopenhagen(): string {
  // "Nu" i Europa/København som Y-M-D
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const d = Number(parts.find((p) => p.type === "day")!.value);
  // JS Date som UTC-midnat for den lokale kalender-dato (så aritmetik ikke rammer DST)
  const cph = new Date(Date.UTC(y, m - 1, d));
  const dow = cph.getUTCDay(); // 0=søn..6=lør
  const daysSinceMonday = (dow + 6) % 7;
  // Mandag i denne uge
  cph.setUTCDate(cph.getUTCDate() - daysSinceMonday);
  // Forrige uges mandag
  cph.setUTCDate(cph.getUTCDate() - 7);
  const yy = cph.getUTCFullYear();
  const mm = String(cph.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(cph.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getISOWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}
