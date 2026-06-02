import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    if (data.approved) {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.targetUserId,
        title: `Din profil er blevet godkendt`,
        body: `Du kan nu deltage i ligaer uden yderligere godkendelse, og du har adgang til lobby-information på dine afdelinger.`,
        link: `/profil`,
      });
    }

    return { ok: true, changed: true, approved: data.approved };
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
      // Find oldest waitlist entry in same class/category
      const { data: nextUp, error: nextErr } = await supabaseAdmin
        .from("entries")
        .select("id,user_id,driver_name")
        .eq("league_id", data.leagueId)
        .is("division_id", null)
        .eq("waitlist", true)
        .eq("car_class", myEntry.car_class)
        .eq("driver_category", myEntry.driver_category)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextErr) throw new Error(nextErr.message);

      if (nextUp) {
        const { error: upErr } = await supabaseAdmin
          .from("entries")
          .update({ waitlist: false })
          .eq("id", nextUp.id);
        if (upErr) throw new Error(upErr.message);

        await supabaseAdmin.from("notifications").insert({
          user_id: nextUp.user_id,
          title: `Du er rykket op fra ventelisten i ${leagueName}`,
          body: `En plads er blevet ledig i ${myEntry.car_class} · ${myEntry.driver_category}. Du er nu på griddet og kan deltage i løbet.`,
          link: `/ligaer/${data.leagueId}`,
        });

        promotedDriver = nextUp.driver_name;
      }
    }

    return { ok: true, promotedDriver };
  });
