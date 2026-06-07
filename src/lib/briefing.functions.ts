import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoomInput = z.object({ divisionId: z.string().uuid() });
const ParticipantInput = z.object({
  divisionId: z.string().uuid(),
  participantIdentity: z.string().min(1).max(128),
});

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/** Mint a LiveKit access token for the current user, scoped to a division's briefing room. */
export const getBriefingToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RoomInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { AccessToken } = await import("livekit-server-sdk");

    const apiKey = process.env.LIVEKIT_API_KEY!;
    const apiSecret = process.env.LIVEKIT_API_SECRET!;
    const wsUrl = process.env.LIVEKIT_URL!;
    if (!apiKey || !apiSecret || !wsUrl) throw new Error("LiveKit secrets ikke konfigureret");

    const admin = await isAdmin(supabase, userId);

    // Only enrolled, non-waitlist drivers (or admins) may join a briefing room
    if (!admin) {
      const { data: entry } = await supabase
        .from("entries")
        .select("id")
        .eq("division_id", data.divisionId)
        .eq("user_id", userId)
        .eq("waitlist", false)
        .maybeSingle();
      if (!entry) throw new Error("Du er ikke tilmeldt denne afdeling.");
    }

    // Fetch display info for the token (name + avatar)
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    const room = `briefing-${data.divisionId}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: profile?.display_name ?? "Kører",
      metadata: JSON.stringify({
        display_name: profile?.display_name ?? "Kører",
        avatar_url: profile?.avatar_url ?? null,
        is_admin: admin,
      }),
      ttl: 60 * 60 * 6,
    });
    at.addGrant({
      room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: admin, // only admins can publish audio by default
      canPublishData: true,
      roomAdmin: admin,
    });

    return { token: await at.toJwt(), url: wsUrl, room, isAdmin: admin };
  });

/** Admin: grant a participant permission to publish audio (give them the floor). */
export const grantSpeak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ParticipantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Kun admins");

    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const room = `briefing-${data.divisionId}`;
    await svc.updateParticipant(room, data.participantIdentity, undefined, {
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
    });
    return { ok: true };
  });

/** Admin: revoke speak permission and mute the participant's tracks. */
export const revokeSpeak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ParticipantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Kun admins");

    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const room = `briefing-${data.divisionId}`;

    // Mute their published audio tracks first
    try {
      const participant = await svc.getParticipant(room, data.participantIdentity);
      for (const track of participant.tracks ?? []) {
        if (track.type === 0 /* AUDIO */ || (track as any).source === 1 /* MICROPHONE */) {
          await svc.mutePublishedTrack(room, data.participantIdentity, track.sid, true);
        }
      }
    } catch {
      // participant might already be gone — ignore
    }

    await svc.updateParticipant(room, data.participantIdentity, undefined, {
      canSubscribe: true,
      canPublish: false,
      canPublishData: true,
    });

    // Also lower their hand if it's still up
    await supabase
      .from("briefing_raised_hands")
      .delete()
      .eq("division_id", data.divisionId)
      .eq("user_id", data.participantIdentity);

    return { ok: true };
  });

/** Admin: remove a participant from the room. */
export const removeParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ParticipantInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Kun admins");

    const { RoomServiceClient } = await import("livekit-server-sdk");
    const svc = new RoomServiceClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    );
    const room = `briefing-${data.divisionId}`;
    await svc.removeParticipant(room, data.participantIdentity);
    await supabase
      .from("briefing_raised_hands")
      .delete()
      .eq("division_id", data.divisionId)
      .eq("user_id", data.participantIdentity);
    return { ok: true };
  });
