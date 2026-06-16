import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ protestId: z.string().uuid() });

export const notifyProtestInvolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load protest and verify caller is the submitter
    const { data: protest, error: pErr } = await supabaseAdmin
      .from("protests")
      .select("id, submitted_by, division_id, lap_number, corner, description, divisions(name, leagues(name))")
      .eq("id", data.protestId)
      .maybeSingle();
    if (pErr || !protest) throw new Error(pErr?.message ?? "Protest ikke fundet");
    if (protest.submitted_by !== context.userId) {
      // Allow admins too
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
      if (!isAdmin) throw new Error("Du kan kun sende beskeder til indklagede i dine egne protests.");
    }

    const { data: involved, error: iErr } = await supabaseAdmin
      .from("protest_involved")
      .select("user_id, driver_name")
      .eq("protest_id", data.protestId);
    if (iErr) throw new Error(iErr.message);

    const ligaNavn = (protest as any).divisions?.leagues?.name ?? "ligaen";
    const afdNavn = (protest as any).divisions?.name ?? "";
    const title = "Du er indklaget i en incident-rapport";
    const body =
      `Der er indsendt en incident-rapport hvor du er involveret (${ligaNavn}${afdNavn ? " · " + afdNavn : ""}). ` +
      `Du bedes afgive din forklaring via hjemmesiden under "Mine sager".`;
    const link = "/mine-protests";

    // 1) Website notifications
    const rows = (involved ?? [])
      .filter((r: any) => r.user_id)
      .map((r: any) => ({ user_id: r.user_id, title, body, link }));
    if (rows.length > 0) {
      const { error: nErr } = await supabaseAdmin.from("notifications").insert(rows);
      if (nErr) console.error("notify protest involved insert failed", nErr);
      try {
        const { sendPushToUser } = await import("./push.server");
        await Promise.all(rows.map((r) => sendPushToUser(r.user_id, { title, body: body.slice(0, 140), url: link }).catch(() => {})));
      } catch (_) {}
    }

    // 2) Discord DMs (best-effort)
    const userIds = rows.map((r) => r.user_id);
    if (userIds.length > 0) {
      const { data: privs } = await supabaseAdmin
        .from("profiles_private")
        .select("user_id, discord_user_id")
        .in("user_id", userIds);
      const { sendDiscordDM } = await import("./discord.server");
      const content =
        `**${title}**\n\n${body}\n\nhttps://lmudanmark.dk${link}`;
      await Promise.all(
        (privs ?? []).map(async (p: any) => {
          if (!p.discord_user_id) return;
          const res = await sendDiscordDM(p.discord_user_id, content);
          if (!res.ok) console.error("Protest DM failed", p.user_id, res);
        }),
      );
    }

    return { ok: true, count: rows.length };
  });
