import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Kun admins.");
}

// Idempotent: team owner, team members or admins can trigger a sync for a team.
// Used right after team creation and after member changes.
export const syncTeamDiscordResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ teamId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: team }, { data: member }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("teams").select("owner_id").eq("id", data.teamId).maybeSingle(),
      supabaseAdmin.from("team_members").select("user_id").eq("team_id", data.teamId).eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!team || (!isAdmin && team.owner_id !== context.userId && !member)) {
      return { ok: false, errors: ["Ingen adgang til dette team."], reason: "forbidden" };
    }
    try {
      const { syncTeamDiscordResourcesCore } = await import("./team-discord.server");
      return await syncTeamDiscordResourcesCore(data.teamId);
    } catch (e) {
      return { ok: false, errors: [(e as Error).message], reason: "exception" };
    }
  });

// Admin: backfill / re-sync every existing team.
export const syncAllTeamsDiscordResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncTeamDiscordResourcesCore } = await import("./team-discord.server");
    const { data: teams } = await supabaseAdmin.from("teams").select("id, name");
    const list = (teams ?? []) as { id: string; name: string }[];
    const results: Array<{ teamId: string; name: string; ok: boolean; errors?: string[] }> = [];
    for (const t of list) {
      try {
        const r = await syncTeamDiscordResourcesCore(t.id);
        results.push({ teamId: t.id, name: t.name, ok: r.ok, errors: r.errors });
      } catch (e) {
        results.push({ teamId: t.id, name: t.name, ok: false, errors: [(e as Error).message] });
      }
    }
    return {
      ok: true as const,
      total: list.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      details: results.slice(0, 50),
    };
  });

// Admin: delete Discord resources for a team (role + category + channels).
export const deleteTeamDiscordResources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ teamId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { deleteTeamDiscordResourcesCore } = await import("./team-discord.server");
    return await deleteTeamDiscordResourcesCore(data.teamId);
  });
