import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  leagueId: z.string().uuid(),
  teamId: z.string().uuid(),
  carClass: z.string().min(1, "Vælg en bilklasse"),
  userIds: z.array(z.string().uuid()).min(1, "Vælg mindst én kører"),
  // "replace" (standard) = første tilmelding/fuld opdatering af lineupet.
  // "add" = tilføj kørere til et eksisterende lineup midt i sæsonen.
  mode: z.enum(["replace", "add"]).optional(),
});

export const submitTeamForLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => submitSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller is team owner (or admin)
    const { data: team } = await (supabaseAdmin as any)
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", data.teamId)
      .maybeSingle();
    if (!team) throw new Error("Team findes ikke");

    const { data: adminRow } = await (context.supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!adminRow;
    if ((team as any).owner_id !== context.userId && !isAdmin) {
      throw new Error("Kun teamejeren kan tilmelde teamet til en liga");
    }

    // Verify league exists and has the requested car_class
    const { data: league } = await (supabaseAdmin as any)
      .from("leagues")
      .select("id, name, class_configs")
      .eq("id", data.leagueId)
      .maybeSingle();
    if (!league) throw new Error("Ligaen findes ikke");
    const classes = new Set(
      (Array.isArray((league as any).class_configs) ? (league as any).class_configs : [])
        .map((c: any) => c?.car_class)
        .filter(Boolean),
    );
    if (!classes.has(data.carClass)) {
      throw new Error("Den valgte bilklasse findes ikke i ligaen");
    }

    // Verify all selected users are members of the team AND assigned to this car_class
    const { data: members } = await (supabaseAdmin as any)
      .from("team_members")
      .select("user_id, car_class")
      .eq("team_id", data.teamId);
    const memberMap = new Map<string, string | null>(
      ((members ?? []) as any[]).map((m) => [m.user_id, m.car_class ?? null]),
    );
    for (const uid of data.userIds) {
      if (!memberMap.has(uid)) throw new Error("En valgt kører er ikke medlem af teamet");
      const cc = memberMap.get(uid);
      if (cc !== data.carClass) {
        throw new Error(
          `En valgt kører er ikke tilknyttet ${data.carClass} i teamet. Team-ejeren skal først tildele kørerens klasse på team-siden.`,
        );
      }
    }

    // Verify every selected user is signed up in this league + class
    const { data: entries } = await (supabaseAdmin as any)
      .from("entries")
      .select("user_id")
      .is("withdrawn_at", null)
      .eq("league_id", data.leagueId)
      .eq("car_class", data.carClass)
      .in("user_id", data.userIds);
    const enrolled = new Set(((entries ?? []) as any[]).map((e) => e.user_id));
    for (const uid of data.userIds) {
      if (!enrolled.has(uid)) {
        throw new Error(
          `Alle valgte kørere skal være tilmeldt ${data.carClass} i ligaen før de kan sættes på lineupet`,
        );
      }
    }

    // Block users locked to another team in another active league
    for (const uid of data.userIds) {
      const { data: locked } = await (supabaseAdmin as any).rpc("user_locked_team", {
        _user_id: uid,
      });
      if (locked && locked !== data.teamId) {
        throw new Error("En valgt kører er låst til et andet team i en aktiv liga");
      }
    }

    const isAdd = data.mode === "add";

    // Insert / fetch the entry (unique on league_id+team_id+car_class)
    const { data: existing } = await (supabaseAdmin as any)
      .from("league_team_entries")
      .select("id, status")
      .eq("league_id", data.leagueId)
      .eq("team_id", data.teamId)
      .eq("car_class", data.carClass)
      .maybeSingle();

    if (isAdd && !existing) throw new Error("Teamet er ikke tilmeldt denne liga og klasse endnu");

    let entryId: string;
    if (existing) {
      entryId = (existing as any).id;
      if ((existing as any).status === "withdrawn") {
        await (supabaseAdmin as any)
          .from("league_team_entries")
          .update({ status: "pending", submitted_by: context.userId })
          .eq("id", entryId);
      }
    } else {
      const { data: ins, error: insErr } = await (supabaseAdmin as any)
        .from("league_team_entries")
        .insert({
          league_id: data.leagueId,
          team_id: data.teamId,
          car_class: data.carClass,
          submitted_by: context.userId,
          status: "pending",
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      entryId = (ins as any).id;
    }

    // Eksisterende lineup-rækker
    const { data: currentRows } = await (supabaseAdmin as any)
      .from("league_team_lineup")
      .select("user_id, status")
      .eq("league_team_entry_id", entryId);
    const currentIds = new Set(
      ((currentRows ?? []) as any[])
        .filter((r) => r.status !== "declined")
        .map((r) => r.user_id as string),
    );

    if (!isAdd && data.userIds.length < 2) {
      throw new Error("Et team-lineup skal indeholde mindst 2 kørere");
    }

    const newIds = data.userIds.filter((uid) => !currentIds.has(uid));
    const totalCount = new Set([...currentIds, ...data.userIds]).size;

    if (isAdd) {
      if (newIds.length === 0) throw new Error("Vælg mindst én ny kører");
      if (totalCount < 2) throw new Error("Et team-lineup skal indeholde mindst 2 kørere");
    } else {
      // Reset lineup: remove existing rows that are not in the new selection
      await (supabaseAdmin as any)
        .from("league_team_lineup")
        .delete()
        .eq("league_team_entry_id", entryId)
        .not("user_id", "in", `(${data.userIds.map((u) => `"${u}"`).join(",")})`);
    }

    // Team owner submits the lineup on behalf of members they already have an agreement with,
    // so every selected driver is auto-accepted — no separate invitation flow.
    const nowIso = new Date().toISOString();
    // Kørere tilføjet midt i sæsonen tæller først med fra afdelinger der køres
    // efter tilføjelsen — tidligere afdelingers team-resultater er urørte.
    const rowsToUpsert = isAdd ? newIds : data.userIds;
    const lineupRows = rowsToUpsert.map((uid) => ({
      league_team_entry_id: entryId,
      league_id: data.leagueId,
      user_id: uid,
      status: "accepted" as const,
      responded_at: nowIso,
      ...(isAdd ? { effective_from: nowIso } : { effective_from: null }),
    }));
    const { error: upErr } = await (supabaseAdmin as any)
      .from("league_team_lineup")
      .upsert(lineupRows, { onConflict: "league_team_entry_id,user_id", ignoreDuplicates: false })
      .select("id, user_id, status");
    if (upErr) throw new Error(upErr.message);

    // With all lineup rows accepted, confirm the entry immediately when >= 2 drivers.
    try {
      if (totalCount >= 2) {
        await (supabaseAdmin as any)
          .from("league_team_entries")
          .update({ status: "confirmed" })
          .eq("id", entryId);
      }
    } catch (_) {}


    // In-app notification (informational — no action required)
    try {
      const rows = rowsToUpsert.map((uid) => ({
        user_id: uid,
        title: `Du er sat på "${(team as any).name}" lineup i ${(league as any).name} (${data.carClass})`,
        body: "Teamejeren har tilmeldt dig til denne liga.",
        link: `/teams/${data.teamId}`,
      }));
      if (rows.length > 0) await (supabaseAdmin as any).from("notifications").insert(rows);
    } catch (_) {}



    return { ok: true, entryId };
  });

const respondSchema = z.object({
  lineupId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

export const respondLeagueLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => respondSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { respondLeagueLineupCore } = await import("./league-team-lineup.server");
    const res = await respondLeagueLineupCore({
      lineupId: data.lineupId,
      action: data.action,
      actingUserId: context.userId,
    });
    if (res.status === "missing") throw new Error("Lineup-invitationen findes ikke");
    if (res.status === "forbidden") throw new Error("Du har ikke adgang til denne invitation");
    if (res.status === "already") throw new Error("Invitationen er allerede besvaret");
    return { ok: true, teamName: res.teamName, allAccepted: res.allAccepted };
  });

const removeSchema = z.object({
  entryId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).min(1, "Vælg mindst én kører"),
});

// Fjern kørere fra et lineup midt i sæsonen.
// Accepterede kørere slettes ikke — de markeres med effective_until = nu, så
// deres bidrag til teamets resultater i allerede kørte afdelinger bevares.
// Inviterede (endnu ikke accepterede) rækker slettes helt.
export const removeDriversFromLineup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => removeSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entry } = await (supabaseAdmin as any)
      .from("league_team_entries")
      .select("id, team_id, league_id, car_class, status, teams:team_id(name, owner_id), leagues:league_id(name)")
      .eq("id", data.entryId)
      .maybeSingle();
    if (!entry) throw new Error("Tilmelding findes ikke");

    const { data: adminRow } = await (context.supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!adminRow;
    if ((entry as any).teams?.owner_id !== context.userId && !isAdmin) {
      throw new Error("Kun teamejeren kan fjerne kørere fra lineupet");
    }

    const { data: rows } = await (supabaseAdmin as any)
      .from("league_team_lineup")
      .select("id, user_id, status, effective_until")
      .eq("league_team_entry_id", data.entryId)
      .in("user_id", data.userIds);
    const found = (rows ?? []) as Array<{ id: string; user_id: string; status: string; effective_until: string | null }>;
    if (found.length === 0) throw new Error("Ingen af de valgte kørere er på lineupet");

    const nowIso = new Date().toISOString();
    const invitedIds = found.filter((r) => r.status === "invited").map((r) => r.id);
    const activeIds = found
      .filter((r) => r.status !== "invited" && !r.effective_until)
      .map((r) => r.id);

    if (invitedIds.length > 0) {
      await (supabaseAdmin as any)
        .from("league_team_lineup")
        .delete()
        .in("id", invitedIds);
    }
    if (activeIds.length > 0) {
      const { error: upErr } = await (supabaseAdmin as any)
        .from("league_team_lineup")
        .update({ effective_until: nowIso })
        .in("id", activeIds);
      if (upErr) throw new Error(upErr.message);
    }

    // Nedjuster entry-status hvis der er under 2 aktive kørere tilbage
    try {
      const { data: remaining } = await (supabaseAdmin as any)
        .from("league_team_lineup")
        .select("id, status, effective_until")
        .eq("league_team_entry_id", data.entryId);
      const activeCount = ((remaining ?? []) as any[]).filter(
        (r) => r.status !== "declined" && !r.effective_until,
      ).length;
      if (activeCount < 2 && (entry as any).status === "confirmed") {
        await (supabaseAdmin as any)
          .from("league_team_entries")
          .update({ status: "pending" })
          .eq("id", data.entryId);
      }
    } catch (_) {}

    // Besked til de fjernede kørere
    try {
      const notifRows = found.map((r) => ({
        user_id: r.user_id,
        title: `Du er fjernet fra "${(entry as any).teams?.name ?? "teamet"}" lineup i ${(entry as any).leagues?.name ?? "ligaen"} (${(entry as any).car_class})`,
        body: "Teamejeren har fjernet dig fra lineupet. Dine resultater i allerede kørte afdelinger tæller stadig med for teamet.",
        link: `/teams/${(entry as any).team_id}`,
      }));
      if (notifRows.length > 0) await (supabaseAdmin as any).from("notifications").insert(notifRows);
    } catch (_) {}

    return { ok: true, removed: found.map((r) => r.user_id) };
  });

const withdrawSchema = z.object({ entryId: z.string().uuid() });

export const withdrawTeamFromLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => withdrawSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entry } = await (supabaseAdmin as any)
      .from("league_team_entries")
      .select("id, team_id, league_id, teams:team_id(owner_id)")
      .eq("id", data.entryId)
      .maybeSingle();
    if (!entry) throw new Error("Tilmelding findes ikke");

    const { data: adminRow } = await (context.supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!adminRow;
    if ((entry as any).teams?.owner_id !== context.userId && !isAdmin) {
      throw new Error("Kun teamejeren kan trække tilmeldingen tilbage");
    }

    const { data: active } = await (supabaseAdmin as any).rpc("league_is_active", {
      _league_id: (entry as any).league_id,
    });
    if (active && !isAdmin) {
      throw new Error("Ligaen er aktiv — tilmeldingen kan ikke trækkes tilbage");
    }

    await (supabaseAdmin as any)
      .from("league_team_entries")
      .update({ status: "withdrawn" })
      .eq("id", data.entryId);

    // Cancel pending invites
    await (supabaseAdmin as any)
      .from("league_team_lineup")
      .delete()
      .eq("league_team_entry_id", data.entryId)
      .eq("status", "invited");

    return { ok: true };
  });
