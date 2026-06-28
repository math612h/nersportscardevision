// Server-only Discord helpers for coaching flow. Import only from other *.server.ts or inside handlers.

type Booking = {
  id: string;
  coach_user_id: string;
  user_id: string;
  focus_points: string[];
  duration_minutes: number;
  track: string;
  layout: string | null;
  starts_at: string;
  extra_info: string | null;
  status: string;
  rejection_reason: string | null;
  discord_channel_id: string | null;
  reminder_sent_at: string | null;
  coach_notified_message_id: string | null;
  coach_notified_channel_id: string | null;
};

async function getDiscordId(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles_private").select("discord_user_id").eq("user_id", userId).maybeSingle();
  return data?.discord_user_id ?? null;
}
async function getDisplayName(supabaseAdmin: any, userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name ?? "Bruger";
}

function formatBookingSummary(b: Booking, userName: string): string {
  const unix = Math.floor(new Date(b.starts_at).getTime() / 1000);
  const lines = [
    `🎯 **Coaching-booking fra ${userName}**`,
    `🕒 Tid: <t:${unix}:F> (<t:${unix}:R>)`,
    `⏱️ Varighed: **${b.duration_minutes} min**`,
    `🏁 Bane: **${b.track}${b.layout ? ` — ${b.layout}` : ""}**`,
    "",
    "**Fokuspunkter:**",
    ...b.focus_points.map((f) => `• ${f}`),
  ];
  if (b.extra_info) lines.push("", "**Ekstra info fra brugeren:**", b.extra_info.slice(0, 1500));
  return lines.join("\n");
}

export async function notifyCoachOfNewBooking(bookingId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendDiscordDM } = await import("./discord.server");
  const { data: b } = await supabaseAdmin.from("coaching_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return;
  const booking = b as Booking;
  const coachDid = await getDiscordId(supabaseAdmin, booking.coach_user_id);
  if (!coachDid) {
    console.warn("[coaching] coach has no Discord linked", booking.coach_user_id);
    return;
  }
  const userName = await getDisplayName(supabaseAdmin, booking.user_id);
  const content = formatBookingSummary(booking, userName);
  const components = [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Bekræft", custom_id: `coaching_confirm:${booking.id}` },
        { type: 2, style: 4, label: "Afvis", custom_id: `coaching_reject:${booking.id}` },
      ],
    },
  ];
  const res = await sendDiscordDM(coachDid, content, components);
  if (res.ok && res.messageId && res.channelId) {
    await supabaseAdmin.from("coaching_bookings").update({
      coach_notified_message_id: res.messageId,
      coach_notified_channel_id: res.channelId,
    }).eq("id", booking.id);
  } else {
    console.error("[coaching] DM to coach failed", res);
  }
}

export async function notifyUserOfRejection(bookingId: string, reason: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendDiscordDM } = await import("./discord.server");
  const { data: b } = await supabaseAdmin.from("coaching_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return;
  const userDid = await getDiscordId(supabaseAdmin, b.user_id);
  const coachName = await getDisplayName(supabaseAdmin, b.coach_user_id);
  const unix = Math.floor(new Date(b.starts_at).getTime() / 1000);
  const content = [
    `😔 **Din coaching-booking blev afvist**`,
    `Coach: **${coachName}**`,
    `Tid: <t:${unix}:F>`,
    "",
    `**Begrundelse:**`,
    reason.slice(0, 1500),
    "",
    "Du kan booke en ny tid på LMU Danmark hjemmesiden.",
  ].join("\n");
  if (userDid) await sendDiscordDM(userDid, content);
}

export async function notifyUserOfConfirmation(bookingId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendDiscordDM } = await import("./discord.server");
  const { data: b } = await supabaseAdmin.from("coaching_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return;
  const userDid = await getDiscordId(supabaseAdmin, b.user_id);
  const coachName = await getDisplayName(supabaseAdmin, b.coach_user_id);
  const unix = Math.floor(new Date(b.starts_at).getTime() / 1000);
  const channel = b.discord_channel_id ? `<#${b.discord_channel_id}>` : "(coachen finder en kanal)";
  const content = [
    `✅ **Din coaching-booking er bekræftet!**`,
    `Coach: **${coachName}**`,
    `Tid: <t:${unix}:F> (<t:${unix}:R>)`,
    `Varighed: **${b.duration_minutes} min**`,
    `Bane: **${b.track}${b.layout ? ` — ${b.layout}` : ""}**`,
    `Kanal: ${channel}`,
    "",
    "Vi sender en påmindelse 2 timer før sessionen starter.",
  ].join("\n");
  if (userDid) await sendDiscordDM(userDid, content);
}

export async function notifyCancellation(bookingId: string, cancelledBy: "user" | "coach", reason: string | null): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendDiscordDM } = await import("./discord.server");
  const { data: b } = await supabaseAdmin.from("coaching_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return;
  const [coachDid, userDid, coachName, userName] = await Promise.all([
    getDiscordId(supabaseAdmin, b.coach_user_id),
    getDiscordId(supabaseAdmin, b.user_id),
    getDisplayName(supabaseAdmin, b.coach_user_id),
    getDisplayName(supabaseAdmin, b.user_id),
  ]);
  const unix = Math.floor(new Date(b.starts_at).getTime() / 1000);
  const who = cancelledBy === "user" ? userName : coachName;
  const lines = [
    `❌ **Coaching-session aflyst**`,
    `Aflyst af: **${who}**${cancelledBy === "coach" ? " (coach)" : " (bruger)"}`,
    `Tid: <t:${unix}:F> (<t:${unix}:R>)`,
    `Varighed: **${b.duration_minutes} min**`,
    `Bane: **${b.track}${b.layout ? ` — ${b.layout}` : ""}**`,
  ];
  if (reason) lines.push("", `**Begrundelse:**`, reason.slice(0, 1500));
  const content = lines.join("\n");
  if (coachDid) await sendDiscordDM(coachDid, content);
  if (userDid) await sendDiscordDM(userDid, content);
}

export async function sendCoachingReminders(): Promise<{ sent: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendDiscordDM } = await import("./discord.server");
  const now = Date.now();
  const lower = new Date(now + (2 * 60 - 5) * 60_000).toISOString(); // ~1h55m
  const upper = new Date(now + (2 * 60 + 5) * 60_000).toISOString(); // ~2h05m
  const { data: rows } = await supabaseAdmin
    .from("coaching_bookings")
    .select("*")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", lower)
    .lte("starts_at", upper);
  let sent = 0;
  for (const b of (rows ?? []) as Booking[]) {
    const [coachDid, userDid, coachName, userName] = await Promise.all([
      getDiscordId(supabaseAdmin, b.coach_user_id),
      getDiscordId(supabaseAdmin, b.user_id),
      getDisplayName(supabaseAdmin, b.coach_user_id),
      getDisplayName(supabaseAdmin, b.user_id),
    ]);
    const unix = Math.floor(new Date(b.starts_at).getTime() / 1000);
    const channel = b.discord_channel_id ? `<#${b.discord_channel_id}>` : "(aftal med modparten)";
    const baseLines = [
      `⏰ **Påmindelse: coaching-session om 2 timer**`,
      `Tid: <t:${unix}:F> (<t:${unix}:R>)`,
      `Varighed: **${b.duration_minutes} min**`,
      `Bane: **${b.track}${b.layout ? ` — ${b.layout}` : ""}**`,
      `Kanal: ${channel}`,
    ];
    if (coachDid) await sendDiscordDM(coachDid, [...baseLines, `Bruger: **${userName}**`].join("\n"));
    if (userDid) await sendDiscordDM(userDid, [...baseLines, `Coach: **${coachName}**`].join("\n"));
    await supabaseAdmin.from("coaching_bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
    sent++;
  }
  return { sent };
}

// List text/voice channels the bot can access in the guild (for coach to pick after confirm)
export async function listSelectableChannelsForCoach(): Promise<Array<{ id: string; name: string; type: number }>> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !token) return [];
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) return [];
  const all = (await res.json()) as Array<{ id: string; name: string; type: number }>;
  // 0 = text, 2 = voice
  return all.filter((c) => c.type === 0 || c.type === 2).slice(0, 25);
}

// Find (or create) the "Coach" role in the guild and add/remove it on the user.
export async function syncDiscordCoachRole(userId: string, isCoach: boolean): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !token) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const discordId = await getDiscordId(supabaseAdmin, userId);
  if (!discordId) {
    console.warn("[coaching] user has no Discord linked", userId);
    return;
  }
  const { addGuildRole, removeGuildRole, createGuildRole } = await import("./discord.server");
  // Look up "Coach" role (case-insensitive)
  const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!rolesRes.ok) {
    console.error("[coaching] could not list guild roles", rolesRes.status);
    return;
  }
  const roles = (await rolesRes.json()) as Array<{ id: string; name: string }>;
  let role = roles.find((r) => r.name.toLowerCase() === "coach");
  if (!role) {
    if (!isCoach) return; // nothing to remove
    const created = await createGuildRole("Coach");
    if (!created.ok || !created.id) {
      console.error("[coaching] failed to create Coach role", created);
      return;
    }
    role = { id: created.id, name: "Coach" };
  }
  if (isCoach) await addGuildRole(discordId, role.id);
  else await removeGuildRole(discordId, role.id);
}
