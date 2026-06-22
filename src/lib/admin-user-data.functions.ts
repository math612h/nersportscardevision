import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only: hent alle data om en bruger til kontrolpanelet.
 * Returnerer profil, private oplysninger, roller, teams, tilmeldinger m.fl.
 */
export const adminGetUserData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = data.userId;

    const [
      authRes,
      profileRes,
      privateRes,
      rolesRes,
      teamsRes,
      entriesRes,
      ratingsRes,
      classRatingsRes,
      leaderboardCountRes,
      resultsCountRes,
      auditRes,
      deviceTokensRes,
    ] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(uid),
      supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabaseAdmin.from("profiles_private").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", uid),
      supabaseAdmin.from("team_members").select("role, teams(id,name)").eq("user_id", uid),
      supabaseAdmin
        .from("entries")
        .select("id, league_id, car_class, car_number, driver_category, waitlist, created_at, leagues(name)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("user_ratings").select("*").eq("user_id", uid).maybeSingle(),
      supabaseAdmin.from("user_class_ratings").select("car_class, score, percentile, confidence").eq("user_id", uid),
      supabaseAdmin.from("leaderboard_times").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabaseAdmin.from("league_results").select("id", { count: "exact", head: true }).eq("user_id", uid),
      supabaseAdmin
        .from("audit_log")
        .select("id, action, table_name, created_at, actor_label, metadata")
        .or(`row_id.eq.${uid},actor_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("device_tokens").select("id, label, created_at, last_used_at").eq("user_id", uid),
    ]);

    return {
      auth: {
        email: authRes.data.user?.email ?? null,
        created_at: authRes.data.user?.created_at ?? null,
        last_sign_in_at: authRes.data.user?.last_sign_in_at ?? null,
        confirmed_at: authRes.data.user?.confirmed_at ?? null,
      },
      profile: profileRes.data ?? null,
      private: privateRes.data ?? null,
      roles: (rolesRes.data ?? []).map((r: { role: string }) => r.role),
      teams: teamsRes.data ?? [],
      entries: entriesRes.data ?? [],
      rating: ratingsRes.data ?? null,
      classRatings: classRatingsRes.data ?? [],
      leaderboardCount: leaderboardCountRes.count ?? 0,
      resultsCount: resultsCountRes.count ?? 0,
      audit: auditRes.data ?? [],
      deviceTokens: deviceTokensRes.data ?? [],
    };
  });
