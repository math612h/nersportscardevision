import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://lmudanmark.dk";

async function notifyAndDM(
  admin: any,
  userId: string,
  title: string,
  body: string,
  link: string,
) {
  await admin.from("notifications").insert({ user_id: userId, title, body, link });
  try {
    const { data: priv } = await admin
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    const discordId = (priv as { discord_user_id?: string | null } | null)?.discord_user_id ?? null;
    if (discordId) {
      const { sendDiscordDM } = await import("./discord.server");
      const res = await sendDiscordDM(discordId, `**${title}**\n\n${body}\n\n${SITE}${link}`);
      if (!res.ok) console.error("League DM failed", userId, res);
    }
  } catch (e) {
    console.error("League DM error", e);
  }
}

export const setProfileApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      targetUserId: z.string().uuid(),
      approved: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw new Error("Kun admins kan godkende profiler.");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,approved,display_name")
      .eq("id", data.targetUserId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Profil findes ikke.");
    if (profile.approved === data.approved) {
      return { ok: true, changed: false, approved: data.approved };
    }

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ approved: data.approved })
      .eq("id", data.targetUserId);
    if (upErr) throw new Error(upErr.message);

    // Fetch user's primary league signups (division_id null)
    const { data: myEntries } = await supabaseAdmin
      .from("entries")
      .select("id,league_id,car_class,driver_category,waitlist,driver_name,created_at")
      .is("division_id", null)
      .eq("user_id", data.targetUserId);

    const promoted: string[] = [];
    const demoted: string[] = [];

    if (data.approved && myEntries) {
      // Try to promote this user's waitlist entries if capacity allows
      for (const entry of myEntries.filter((e) => e.waitlist && e.league_id)) {
        const leagueId = entry.league_id as string;
        // Get league cap for this class/category
        const { data: league } = await supabaseAdmin
          .from("leagues")
          .select("class_configs,name")
          .eq("id", leagueId)
          .maybeSingle();
        const configs: Array<{ car_class: string; driver_category: string; max_drivers?: number | null }> =
          Array.isArray((league as any)?.class_configs) ? (league as any).class_configs : [];
        const cfg = configs.find((c) => c.car_class === entry.car_class && c.driver_category === entry.driver_category);
        const cap = cfg?.max_drivers ?? null;


        const { data: siblings } = await supabaseAdmin
          .from("entries")
          .select("id,waitlist")
          .eq("league_id", leagueId)
          .is("division_id", null)
          .eq("car_class", entry.car_class)
          .eq("driver_category", entry.driver_category);
        const gridCount = (siblings ?? []).filter((s) => !s.waitlist).length;

        if (cap == null || gridCount < cap) {
          await supabaseAdmin.from("entries").update({ waitlist: false }).eq("id", entry.id);
          promoted.push(league?.name ?? "ligaen");
          await notifyAndDM(
            supabaseAdmin,
            data.targetUserId,
            `Du er rykket op fra ventelisten i ${league?.name ?? "ligaen"}`,
            `Du er nu godkendt og er rykket op på griddet i ${entry.car_class} · ${entry.driver_category} for resten af sæsonen.`,
            `/ligaer/${entry.league_id}`,
          );
        }
      }

      await supabaseAdmin.from("notifications").insert({
        user_id: data.targetUserId,
        title: `Din profil er blevet godkendt`,
        body: `Du kan nu deltage i ligaer uden yderligere godkendelse, og du har adgang til lobby-information på dine afdelinger.`,
        link: `/profil`,
      });
    }

    if (!data.approved && myEntries) {
      // Demote any grid entries to waitlist; promote next approved waitlister
      for (const entry of myEntries.filter((e) => !e.waitlist && e.league_id)) {
        const leagueId = entry.league_id as string;
        await supabaseAdmin.from("entries").update({ waitlist: true }).eq("id", entry.id);
        demoted.push(entry.driver_name);

        // Find next approved waitlist entry in same class/category
        const { data: waitlisters } = await supabaseAdmin
          .from("entries")
          .select("id,user_id,driver_name,created_at")
          .eq("league_id", leagueId)
          .is("division_id", null)
          .eq("waitlist", true)
          .eq("car_class", entry.car_class)
          .eq("driver_category", entry.driver_category)
          .neq("user_id", data.targetUserId)
          .order("created_at", { ascending: true });

        if (waitlisters && waitlisters.length > 0) {
          const userIds = waitlisters.map((w) => w.user_id);
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id,approved")
            .in("id", userIds);
          const approvedSet = new Set((profs ?? []).filter((p) => p.approved).map((p) => p.id));
          const nextUp = waitlisters.find((w) => approvedSet.has(w.user_id));


          if (nextUp) {
            await supabaseAdmin.from("entries").update({ waitlist: false }).eq("id", nextUp.id);
            const { data: league } = await supabaseAdmin
              .from("leagues").select("name").eq("id", leagueId).maybeSingle();
            await notifyAndDM(
              supabaseAdmin,
              nextUp.user_id,
              `Du er rykket op fra ventelisten i ${league?.name ?? "ligaen"}`,
              `En plads er blevet ledig i ${entry.car_class} · ${entry.driver_category}. Du er nu på griddet for resten af sæsonen.`,
              `/ligaer/${entry.league_id}`,
            );
          }
        }
      }

      await supabaseAdmin.from("notifications").insert({
        user_id: data.targetUserId,
        title: `Din godkendelse er fjernet`,
        body: `Dine tilmeldinger er flyttet til ventelisten. Kontakt en admin hvis du har spørgsmål.`,
        link: `/profil`,
      });
    }

    return { ok: true, changed: true, approved: data.approved, promoted, demoted };
  });

export const leaveLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find the user's primary signup (division_id null) for this league
    const { data: myEntry, error: meErr } = await supabaseAdmin
      .from("entries")
      .select("id,car_class,driver_category,waitlist")
      .eq("league_id", data.leagueId)
      .is("division_id", null)
      .eq("user_id", userId)
      .maybeSingle();
    if (meErr) throw new Error(meErr.message);
    if (!myEntry) throw new Error("Du er ikke tilmeldt denne liga.");

    const wasOnGrid = !myEntry.waitlist;

    // Get league name for notification
    const { data: league } = await supabaseAdmin
      .from("leagues")
      .select("name")
      .eq("id", data.leagueId)
      .maybeSingle();
    const leagueName = league?.name ?? "ligaen";

    // Delete the entry
    const { error: delErr } = await supabaseAdmin.from("entries").delete().eq("id", myEntry.id);
    if (delErr) throw new Error(delErr.message);

    let promotedDriver: string | null = null;

    if (wasOnGrid) {
      // Find oldest approved waitlist entry in same class/category
      const { data: waitlisters, error: nextErr } = await supabaseAdmin
        .from("entries")
        .select("id,user_id,driver_name,created_at")
        .eq("league_id", data.leagueId)
        .is("division_id", null)
        .eq("waitlist", true)
        .eq("car_class", myEntry.car_class)
        .eq("driver_category", myEntry.driver_category)
        .order("created_at", { ascending: true });
      if (nextErr) throw new Error(nextErr.message);

      if (waitlisters && waitlisters.length > 0) {
        const userIds = waitlisters.map((w) => w.user_id);
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id,approved")
          .in("id", userIds);
        const approvedSet = new Set((profs ?? []).filter((p) => p.approved).map((p) => p.id));
        const nextUp = waitlisters.find((w) => approvedSet.has(w.user_id));



        if (nextUp) {
          const { error: upErr } = await supabaseAdmin
            .from("entries")
            .update({ waitlist: false })
            .eq("id", nextUp.id);
          if (upErr) throw new Error(upErr.message);

          await notifyAndDM(
            supabaseAdmin,
            nextUp.user_id,
            `Du er rykket op fra ventelisten i ${leagueName}`,
            `En plads er blevet ledig i ${myEntry.car_class} · ${myEntry.driver_category}. Du er nu på griddet for resten af sæsonen og kan deltage i løbene.`,
            `/ligaer/${data.leagueId}`,
          );

          promotedDriver = nextUp.driver_name;
        }
      }
    }

    return { ok: true, promotedDriver };
  });
