import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COACHING_FOCUS_POINTS, COACHING_DURATIONS } from "./coaching-focus-points";

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  return !!data;
}
async function isCoach(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "coach").maybeSingle();
  return !!data;
}

export type CoachListItem = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[];
  achievements: string[];
  active: boolean;
};

// Public-ish: list active coaches with their profile info
export const listCoaches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profiles } = await context.supabase
      .from("coach_profiles")
      .select("user_id, bio, specialties, achievements, active")
      .eq("active", true);
    const ids = (profiles ?? []).map((p: any) => p.user_id);
    if (ids.length === 0) return [] as CoachListItem[];
    const { data: ppl } = await context.supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    const map = new Map((ppl ?? []).map((p: any) => [p.id, p]));
    return (profiles ?? []).map((p: any) => ({
      user_id: p.user_id,
      display_name: map.get(p.user_id)?.display_name ?? "Coach",
      avatar_url: map.get(p.user_id)?.avatar_url ?? null,
      bio: p.bio,
      specialties: p.specialties ?? [],
      achievements: p.achievements ?? [],
      active: p.active,
    })) as CoachListItem[];
  });

// Public: list active coaches (no auth) — safe fields only
export const listCoachesPublic = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("coach_profiles")
      .select("user_id, bio, specialties, achievements, active")
      .eq("active", true);
    const ids = (profiles ?? []).map((p: any) => p.user_id);
    if (ids.length === 0) return [] as CoachListItem[];
    const { data: ppl } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    const map = new Map((ppl ?? []).map((p: any) => [p.id, p]));
    return (profiles ?? []).map((p: any) => ({
      user_id: p.user_id,
      display_name: map.get(p.user_id)?.display_name ?? "Coach",
      avatar_url: map.get(p.user_id)?.avatar_url ?? null,
      bio: p.bio,
      specialties: p.specialties ?? [],
      achievements: p.achievements ?? [],
      active: p.active,
    })) as CoachListItem[];
  });

// Public: aggregated rating summary (avg + count) for a coach — used on coach cards
export const getCoachRatingsSummary = createServerFn({ method: "GET" })
  .inputValidator((d: { coach_user_id: string }) => ({ coach_user_id: String(d.coach_user_id) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("coaching_ratings")
      .select("stars")
      .eq("coach_user_id", data.coach_user_id);
    const count = rows?.length ?? 0;
    const avg = count > 0 ? (rows!.reduce((s: number, r: any) => s + r.stars, 0) / count) : 0;
    return { avg: Math.round(avg * 10) / 10, count };
  });

// Public: aggregated summaries for many coaches in one round-trip
export const getCoachRatingsSummaries = createServerFn({ method: "GET" })
  .inputValidator((d: { coach_user_ids: string[] }) => ({
    coach_user_ids: (d.coach_user_ids ?? []).map(String).slice(0, 100),
  }))
  .handler(async ({ data }) => {
    if (data.coach_user_ids.length === 0) return {} as Record<string, { avg: number; count: number }>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("coaching_ratings")
      .select("coach_user_id, stars")
      .in("coach_user_id", data.coach_user_ids);
    const agg: Record<string, { sum: number; count: number }> = {};
    for (const r of rows ?? []) {
      const key = (r as any).coach_user_id as string;
      const s = (r as any).stars as number;
      agg[key] ??= { sum: 0, count: 0 };
      agg[key].sum += s;
      agg[key].count += 1;
    }
    const out: Record<string, { avg: number; count: number }> = {};
    for (const [k, v] of Object.entries(agg)) {
      out[k] = { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
    }
    return out;
  });

// Public: list ratings with commenter display name for a coach
export const listCoachRatings = createServerFn({ method: "GET" })
  .inputValidator((d: { coach_user_id: string }) => ({ coach_user_id: String(d.coach_user_id) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("coaching_ratings")
      .select("id, stars, comment, created_at, rater_user_id")
      .eq("coach_user_id", data.coach_user_id)
      .order("created_at", { ascending: false })
      .limit(100);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.rater_user_id)));
    let people: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (ids.length > 0) {
      const { data: ppl } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      people = Object.fromEntries((ppl ?? []).map((p: any) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]));
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      stars: r.stars,
      comment: r.comment,
      created_at: r.created_at,
      rater_display_name: people[r.rater_user_id]?.display_name ?? "Anonym",
      rater_avatar_url: people[r.rater_user_id]?.avatar_url ?? null,
    }));
  });

// Rater: fetch the booking they're allowed to rate + existing rating (if any)
export const getBookingForRating = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { booking_id: string }) => ({ booking_id: String(d.booking_id) }))
  .handler(async ({ data, context }) => {
    const { data: booking } = await context.supabase
      .from("coaching_bookings")
      .select("id, coach_user_id, user_id, starts_at, duration_minutes, track, layout, focus_points, status")
      .eq("id", data.booking_id)
      .maybeSingle();
    if (!booking) throw new Error("Booking blev ikke fundet");
    if (booking.user_id !== context.userId) throw new Error("Du kan kun rate dine egne sessions");
    const endsAt = new Date(booking.starts_at).getTime() + (booking.duration_minutes ?? 0) * 60_000;
    if (Date.now() < endsAt) throw new Error("Du kan først rate når sessionen er slut");
    const { data: coach } = await context.supabase
      .from("profiles").select("id, display_name, avatar_url").eq("id", booking.coach_user_id).maybeSingle();
    const { data: existing } = await context.supabase
      .from("coaching_ratings")
      .select("id, stars, comment")
      .eq("booking_id", booking.id)
      .maybeSingle();
    return { booking, coach, existing };
  });

// Submit or update a rating
export const submitCoachingRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { booking_id: string; stars: number; comment?: string | null }) => ({
    booking_id: String(d.booking_id),
    stars: Math.max(1, Math.min(5, Math.round(Number(d.stars ?? 0)))),
    comment: (d.comment ?? "").toString().slice(0, 2000).trim() || null,
  }))
  .handler(async ({ data, context }) => {
    const { data: booking } = await context.supabase
      .from("coaching_bookings")
      .select("id, coach_user_id, user_id, starts_at, duration_minutes")
      .eq("id", data.booking_id)
      .maybeSingle();
    if (!booking) throw new Error("Booking blev ikke fundet");
    if (booking.user_id !== context.userId) throw new Error("Du kan kun rate dine egne sessions");
    const endsAt = new Date(booking.starts_at).getTime() + (booking.duration_minutes ?? 0) * 60_000;
    if (Date.now() < endsAt) throw new Error("Du kan først rate når sessionen er slut");

    const { error } = await context.supabase
      .from("coaching_ratings")
      .upsert({
        booking_id: booking.id,
        coach_user_id: booking.coach_user_id,
        rater_user_id: context.userId,
        stars: data.stars,
        comment: data.comment,
      }, { onConflict: "booking_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// My coach profile (for the coach themselves)
export const getMyCoachProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "coach").maybeSingle();
    const hasCoachRole = !!roleRow;
    const { data } = await context.supabase
      .from("coach_profiles").select("*").eq("user_id", context.userId).maybeSingle();
    return { hasCoachRole, profile: data ?? null };
  });

export const upsertMyCoachProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bio: string; specialties: string[]; achievements: string[]; active: boolean }) => {
    return {
      bio: (d.bio ?? "").slice(0, 4000),
      specialties: (d.specialties ?? []).filter((s) => (COACHING_FOCUS_POINTS as readonly string[]).includes(s)),
      achievements: (d.achievements ?? []).map((a) => String(a).slice(0, 200)).slice(0, 30),
      active: !!d.active,
    };
  })
  .handler(async ({ data, context }) => {
    if (!(await isCoach(context))) throw new Error("Du har ikke coach-rollen");
    const { error } = await context.supabase
      .from("coach_profiles")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Availability
export const listCoachAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coach_user_id: string }) => ({ coach_user_id: String(d.coach_user_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("coach_availability")
      .select("*")
      .eq("coach_user_id", data.coach_user_id)
      .order("weekday", { ascending: true, nullsFirst: false });
    return (rows ?? []) as any[];
  });

export const addCoachAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { weekday: number | null; specific_date: string | null; start_time: string; end_time: string }) => {
    const weekday = d.weekday == null ? null : Number(d.weekday);
    const specific_date = d.specific_date || null;
    if ((weekday == null) === (specific_date == null)) {
      throw new Error("Vælg enten en ugedag eller en specifik dato — ikke begge");
    }
    if (weekday != null && (weekday < 0 || weekday > 6)) throw new Error("Ugyldig ugedag");
    const t = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!t.test(d.start_time) || !t.test(d.end_time)) throw new Error("Ugyldigt tidsformat (HH:MM)");
    if (d.end_time <= d.start_time) throw new Error("Sluttid skal være efter starttid");
    return { weekday, specific_date, start_time: d.start_time, end_time: d.end_time };
  })
  .handler(async ({ data, context }) => {
    if (!(await isCoach(context))) throw new Error("Du har ikke coach-rollen");
    const { error } = await context.supabase
      .from("coach_availability").insert({ ...data, coach_user_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCoachAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("coach_availability").delete().eq("id", data.id).eq("coach_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Convert a wall-clock time in Europe/Copenhagen to a UTC Date.
// Server runs in UTC, so we cannot use setHours() — that would treat the
// coach's "19:30" as 19:30 UTC (= 21:30 CEST) and shift the slots forward.
function copenhagenWallclockToUtc(year: number, month0: number, day: number, hour: number, minute: number): Date {
  const utcGuess = Date.UTC(year, month0, day, hour, minute);
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const offset = asUtc - utcGuess; // tz offset in ms
  return new Date(utcGuess - offset);
}

// Slot generation: given coach + date + duration, return possible start times
export const getCoachSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coach_user_id: string; date: string; duration_minutes: number }) => ({
    coach_user_id: String(d.coach_user_id),
    date: String(d.date), // YYYY-MM-DD
    duration_minutes: Number(d.duration_minutes),
  }))
  .handler(async ({ data, context }) => {
    if (!(COACHING_DURATIONS as readonly number[]).includes(data.duration_minutes)) throw new Error("Ugyldig varighed");
    const [yStr, mStr, dStr] = data.date.split("-");
    const y = Number(yStr), m0 = Number(mStr) - 1, dd = Number(dStr);
    if (!y || isNaN(m0) || !dd) throw new Error("Ugyldig dato");
    // Weekday in Copenhagen at noon (avoids DST/midnight edge cases)
    const noonUtc = copenhagenWallclockToUtc(y, m0, dd, 12, 0);
    const wdShort = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Copenhagen", weekday: "short" }).format(noonUtc);
    const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(wdShort);


    const { data: avail } = await context.supabase
      .from("coach_availability")
      .select("weekday, specific_date, start_time, end_time")
      .eq("coach_user_id", data.coach_user_id);

    const windows = (avail ?? []).filter((a: any) =>
      a.specific_date === data.date || (a.specific_date == null && a.weekday === weekday)
    );
    if (windows.length === 0) return [] as string[];

    const dayStart = copenhagenWallclockToUtc(y, m0, dd, 0, 0);
    const dayEnd = copenhagenWallclockToUtc(y, m0, dd, 23, 59);
    const { data: existing } = await context.supabase
      .from("coaching_bookings")
      .select("starts_at, duration_minutes, status")
      .eq("coach_user_id", data.coach_user_id)
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString())
      .in("status", ["pending", "confirmed"]);

    const taken = (existing ?? []).map((b: any) => {
      const s = new Date(b.starts_at).getTime();
      return [s, s + Number(b.duration_minutes) * 60_000] as [number, number];
    });

    const slots: string[] = [];
    const step = 15;
    const dur = data.duration_minutes;
    for (const w of windows) {
      const [sh, sm] = w.start_time.split(":").map(Number);
      const [eh, em] = w.end_time.split(":").map(Number);
      const winStart = copenhagenWallclockToUtc(y, m0, dd, sh, sm).getTime();
      const winEnd = copenhagenWallclockToUtc(y, m0, dd, eh, em).getTime();
      for (let cursor = winStart; cursor + dur * 60_000 <= winEnd; cursor += step * 60_000) {
        const slotEnd = cursor + dur * 60_000;
        if (cursor < Date.now() + 30 * 60_000) continue; // 30 min buffer in future
        const conflicts = taken.some(([s, e]) => cursor < e && slotEnd > s);
        if (conflicts) continue;
        slots.push(new Date(cursor).toISOString());
      }
    }
    return Array.from(new Set(slots)).sort();
  });


// Days in a month that have at least one available slot
export const getCoachAvailableDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coach_user_id: string; year: number; month: number; duration_minutes: number }) => ({
    coach_user_id: String(d.coach_user_id),
    year: Number(d.year),
    month: Number(d.month), // 0-11
    duration_minutes: Number(d.duration_minutes),
  }))
  .handler(async ({ data, context }) => {
    const { data: avail } = await context.supabase
      .from("coach_availability")
      .select("weekday, specific_date, start_time, end_time")
      .eq("coach_user_id", data.coach_user_id);
    if (!avail || avail.length === 0) return [] as string[];
    const monthStart = new Date(data.year, data.month, 1);
    const monthEnd = new Date(data.year, data.month + 1, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result: string[] = [];
    for (let day = new Date(monthStart); day <= monthEnd; day.setDate(day.getDate() + 1)) {
      if (day < today) continue;
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const wd = day.getDay();
      const has = avail.some((a: any) => {
        if (a.specific_date === iso) return true;
        if (a.specific_date == null && a.weekday === wd) {
          const [sh, sm] = a.start_time.split(":").map(Number);
          const [eh, em] = a.end_time.split(":").map(Number);
          return (eh - sh) * 60 + (em - sm) >= data.duration_minutes;
        }
        return false;
      });
      if (has) result.push(iso);
    }
    return result;
  });

// Bookings
export const createCoachingBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    coach_user_id: string;
    focus_points: string[];
    duration_minutes: number;
    track: string;
    layout: string | null;
    starts_at: string;
    extra_info: string | null;
  }) => {
    const focus = (d.focus_points ?? []).filter((f) => (COACHING_FOCUS_POINTS as readonly string[]).includes(f));
    if (focus.length === 0) throw new Error("Vælg mindst ét fokuspunkt");
    if (!(COACHING_DURATIONS as readonly number[]).includes(Number(d.duration_minutes))) throw new Error("Ugyldig varighed");
    if (!d.track) throw new Error("Vælg en bane");
    if (!d.starts_at || isNaN(new Date(d.starts_at).getTime())) throw new Error("Ugyldigt starttidspunkt");
    return {
      coach_user_id: String(d.coach_user_id),
      focus_points: focus,
      duration_minutes: Number(d.duration_minutes),
      track: String(d.track).slice(0, 100),
      layout: d.layout ? String(d.layout).slice(0, 100) : null,
      starts_at: new Date(d.starts_at).toISOString(),
      extra_info: d.extra_info ? String(d.extra_info).slice(0, 2000) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("coaching_bookings")
      .insert({ ...data, user_id: context.userId, status: "pending" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Notify coach via Discord
    try {
      const { notifyCoachOfNewBooking } = await import("./coaching-discord.server");
      await notifyCoachOfNewBooking(row.id);
    } catch (e) {
      console.error("notifyCoachOfNewBooking failed", e);
    }
    return { id: row.id };
  });

export const listMyBookingsAsUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("coaching_bookings").select("*").eq("user_id", context.userId).order("starts_at", { ascending: false });
    const ids = Array.from(new Set((data ?? []).map((b: any) => b.coach_user_id)));
    const { data: coaches } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] as any[] };
    const cm = new Map((coaches ?? []).map((p: any) => [p.id, p]));
    return (data ?? []).map((b: any) => ({ ...b, coach: cm.get(b.coach_user_id) ?? null }));
  });

export const listMyBookingsAsCoach = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCoach(context))) return [];
    const { data } = await context.supabase
      .from("coaching_bookings").select("*").eq("coach_user_id", context.userId).order("starts_at", { ascending: true });
    const ids = Array.from(new Set((data ?? []).map((b: any) => b.user_id)));
    const { data: users } = ids.length
      ? await context.supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] as any[] };
    const um = new Map((users ?? []).map((p: any) => [p.id, p]));
    return (data ?? []).map((b: any) => ({ ...b, user: um.get(b.user_id) ?? null }));
  });

export const cancelMyBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string | null }) => ({
    id: String(d.id),
    reason: d.reason ? String(d.reason).slice(0, 1000) : null,
  }))
  .handler(async ({ data, context }) => {
    const { data: booking, error: fetchErr } = await context.supabase
      .from("coaching_bookings").select("*").eq("id", data.id).maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!booking) throw new Error("Booking ikke fundet");
    if (booking.user_id !== context.userId) throw new Error("Du kan kun aflyse dine egne bookinger");
    if (booking.status === "cancelled" || booking.status === "rejected") {
      return { ok: true };
    }
    const { error } = await context.supabase
      .from("coaching_bookings").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      const { notifyCancellation } = await import("./coaching-discord.server");
      await notifyCancellation(data.id, "user", data.reason);
    } catch (e) {
      console.error("notifyCancellation failed", e);
    }
    return { ok: true };
  });

export const cancelBookingAsCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; reason?: string | null }) => ({
    id: String(d.id),
    reason: d.reason ? String(d.reason).slice(0, 1000) : null,
  }))
  .handler(async ({ data, context }) => {
    const { data: booking, error: fetchErr } = await context.supabase
      .from("coaching_bookings").select("*").eq("id", data.id).maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!booking) throw new Error("Booking ikke fundet");
    if (booking.coach_user_id !== context.userId) throw new Error("Du kan kun aflyse dine egne coaching-sessioner");
    if (booking.status === "cancelled" || booking.status === "rejected") {
      return { ok: true };
    }
    const { error } = await context.supabase
      .from("coaching_bookings").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      const { notifyCancellation } = await import("./coaching-discord.server");
      await notifyCancellation(data.id, "coach", data.reason);
    } catch (e) {
      console.error("notifyCancellation failed", e);
    }
    return { ok: true };
  });

// Admin: assign / unassign coach role
export const adminSetCoachRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; is_coach: boolean }) => ({
    user_id: String(d.user_id),
    is_coach: !!d.is_coach,
  }))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Kun admins");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_coach) {
      const { error } = await supabaseAdmin.from("user_roles").upsert(
        { user_id: data.user_id, role: "coach" },
        { onConflict: "user_id,role" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "coach");
      if (error) throw new Error(error.message);
    }
    // Sync Discord coach role
    try {
      const { syncDiscordCoachRole } = await import("./coaching-discord.server");
      await syncDiscordCoachRole(data.user_id, data.is_coach);
    } catch (e) {
      console.error("[coaching] discord coach role sync failed", e);
    }
    return { ok: true };
  });

export const adminListCoaches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Kun admins");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "coach");
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const { data: ppl } = await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", ids);
    return (ppl ?? []) as any[];
  });

// Admin: delete a coaching rating/comment
export const adminDeleteCoachingRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rating_id: string }) => ({ rating_id: String(d.rating_id) }))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("coaching_ratings").delete().eq("id", data.rating_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: send a test rating-request DM to the calling admin.
// Uses the admin's most recent booking-as-customer if any, otherwise a fake one.
export const adminSendTestRatingDM = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendRatingRequestDM } = await import("@/lib/coaching-discord.server");

    // Try latest real booking where the admin is the customer
    const { data: existing } = await supabaseAdmin
      .from("coaching_bookings")
      .select("id")
      .eq("user_id", context.userId)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let bookingId = existing?.id as string | undefined;
    let ephemeral = false;
    if (!bookingId) {
      // Create a synthetic booking so the DM has real data to render; delete after.
      const { data: coach } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("role", "coach").limit(1).maybeSingle();
      const coachId = (coach?.user_id as string | undefined) ?? context.userId;
      const { data: created, error } = await supabaseAdmin
        .from("coaching_bookings")
        .insert({
          user_id: context.userId,
          coach_user_id: coachId,
          starts_at: new Date(Date.now() - 60 * 60_000).toISOString(),
          duration_minutes: 60,
          track: "Spa-Francorchamps",
          layout: "Grand Prix",
          focus_points: ["Racecraft"],
          status: "completed",
          amount_dkk: 0,
        })
        .select("id").single();
      if (error) throw new Error(error.message);
      bookingId = created.id as string;
      ephemeral = true;
    }

    const res = await sendRatingRequestDM(bookingId!, { testMode: true });

    if (ephemeral && bookingId) {
      await supabaseAdmin.from("coaching_bookings").delete().eq("id", bookingId);
    }

    if (!res.ok) throw new Error(res.reason ?? "DM failed");
    return { ok: true };
  });

