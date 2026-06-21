import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Kun admins");
}

type LkRoom = { name: string; numParticipants: number; creationTime: number };

export const listBriefingRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);

    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const rooms = (await svc.listRooms()) as unknown as LkRoom[];
    const briefings = rooms.filter((r) => r.name.startsWith("briefing-"));

    // Berig med division-/liga-navn
    const divisionIds = briefings.map((r) => r.name.replace("briefing-", ""));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: divs } = divisionIds.length
      ? await supabaseAdmin
          .from("divisions")
          .select("id, name, league_id, leagues(name)")
          .in("id", divisionIds)
      : { data: [] };

    const byId = new Map<string, any>();
    (divs ?? []).forEach((d: any) => byId.set(d.id, d));

    const { data: hands } = divisionIds.length
      ? await supabaseAdmin
          .from("briefing_raised_hands")
          .select("division_id")
          .in("division_id", divisionIds)
      : { data: [] };

    const handsByDiv: Record<string, number> = {};
    (hands ?? []).forEach((h: any) => {
      handsByDiv[h.division_id] = (handsByDiv[h.division_id] ?? 0) + 1;
    });

    return briefings.map((r) => {
      const divId = r.name.replace("briefing-", "");
      const div = byId.get(divId);
      return {
        room: r.name,
        divisionId: divId,
        divisionName: div?.name ?? "(ukendt)",
        leagueName: div?.leagues?.name ?? "(ukendt liga)",
        leagueId: div?.league_id ?? null,
        participants: r.numParticipants,
        raisedHands: handsByDiv[divId] ?? 0,
        createdAt: r.creationTime ? new Date(r.creationTime * 1000).toISOString() : null,
      };
    });
  });

export const listBriefingParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ divisionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const room = `briefing-${data.divisionId}`;
    const ps = await svc.listParticipants(room).catch(() => [] as any[]);
    return (ps as any[]).map((p) => ({
      identity: p.identity,
      name: p.name,
      joinedAt: p.joinedAt ? Number(p.joinedAt) : null,
      canPublish: !!p.permission?.canPublish,
      tracksPublished: (p.tracks ?? []).length,
    }));
  });

export const closeBriefingRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ divisionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const room = `briefing-${data.divisionId}`;
    await svc.deleteRoom(room);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("briefing_raised_hands").delete().eq("division_id", data.divisionId);
    await context.supabase.rpc("log_audit" as any, {
      _action: "briefing_closed",
      _table: "livekit",
      _row_id: room,
    });
    return { ok: true };
  });

export const clearRaisedHands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ divisionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("briefing_raised_hands").delete().eq("division_id", data.divisionId);
    return { ok: true };
  });
