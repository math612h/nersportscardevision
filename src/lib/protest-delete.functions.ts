import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({ protestId: z.string().uuid() });

// Sletter en uafgjort protest (admin/steward) uden følger og giver de indklagede besked.
export const deleteProtest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "steward");
    if (!ok) throw new Error("Kun admins og stewards kan slette protester.");

    const { data: protest, error: pErr } = await supabaseAdmin
      .from("protests")
      .select("id, status, division_id, divisions(name, leagues(name))")
      .eq("id", data.protestId)
      .maybeSingle();
    if (pErr || !protest) throw new Error(pErr?.message ?? "Protest ikke fundet");
    if (protest.status === "ruled") throw new Error("En afgjort protest kan ikke slettes.");

    const { data: involved } = await supabaseAdmin
      .from("protest_involved")
      .select("user_id")
      .eq("protest_id", data.protestId);
    const userIds = [...new Set((involved ?? []).map((r: any) => r.user_id).filter(Boolean))] as string[];

    const { error: iErr } = await supabaseAdmin.from("protest_involved").delete().eq("protest_id", data.protestId);
    if (iErr) throw new Error(iErr.message);
    const { error: dErr } = await supabaseAdmin.from("protests").delete().eq("id", data.protestId);
    if (dErr) throw new Error(dErr.message);

    try {
      await (supabaseAdmin as any).rpc("log_audit", {
        _action: "protest_deleted", _table: "protests", _row_id: data.protestId,
        _old: protest as any, _new: null, _metadata: { by: context.userId },
      });
    } catch (_) {}

    const liga = (protest as any).divisions?.leagues?.name ?? "ligaen";
    const afd = (protest as any).divisions?.name ?? "";
    const title = "Protest fjernet";
    const body = `Protesten fra ${liga}${afd ? " · " + afd : ""}, som du var indklaget i, er blevet fjernet uden følger for nogen af de involverede.`;
    const link = "/mine-protests";

    if (userIds.length > 0) {
      await supabaseAdmin.from("notifications").insert(userIds.map((user_id) => ({ user_id, title, body, link })));
      try {
        const { sendPushToUser } = await import("./push.server");
        await Promise.all(userIds.map((u) => sendPushToUser(u, { title, body: body.slice(0, 140), url: link }).catch(() => {})));
      } catch (_) {}
      try {
        const { data: privs } = await supabaseAdmin.from("profiles_private").select("user_id, discord_user_id").in("user_id", userIds);
        const { sendDiscordDM } = await import("./discord.server");
        await Promise.all((privs ?? []).map(async (p: any) => {
          if (p.discord_user_id) await sendDiscordDM(p.discord_user_id, `**${title}**\n\n${body}`).catch(() => {});
        }));
      } catch (e) { console.error("protest delete DM failed", e); }
    }
    return { ok: true, notified: userIds.length };
  });
