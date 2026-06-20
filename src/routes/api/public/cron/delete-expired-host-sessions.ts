import { createFileRoute } from "@tanstack/react-router";

async function run() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteDiscordChannelMessage } = await import("@/lib/discord.server");

    const { data: rows, error } = await (supabaseAdmin as any)
      .from("discord_hosted_sessions")
      .select("id, channel_id, message_id")
      .lte("delete_at", new Date().toISOString())
      .limit(50);

    if (error) {
      console.error("delete-expired-host-sessions select failed", error);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    let deleted = 0;
    for (const row of (rows ?? []) as Array<{ id: string; channel_id: string; message_id: string }>) {
      const res = await deleteDiscordChannelMessage(row.channel_id, row.message_id);
      // 404 = besked er allerede væk; ryd alligevel op i DB.
      if (res.ok || res.status === 404) {
        await (supabaseAdmin as any)
          .from("discord_hosted_sessions")
          .delete()
          .eq("id", row.id);
        deleted++;
      } else {
        console.error("discord delete failed", row.message_id, res.status, res.message);
      }
    }

    return Response.json({ ok: true, processed: rows?.length ?? 0, deleted });
  } catch (e: any) {
    console.error("delete-expired-host-sessions failed", e);
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/delete-expired-host-sessions")({
  server: {
    handlers: {
      POST: async () => run(),
      GET: async () => run(),
    },
  },
});
