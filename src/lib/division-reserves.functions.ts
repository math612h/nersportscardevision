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
  discordComponents?: any[],
) {
  await admin.from("notifications").insert({ user_id: userId, title, body, link });
  try {
    const { sendPushToUser } = await import("./push.server");
    void sendPushToUser(userId, { title, body, url: link, tag: `notif:${userId}` }).catch(() => {});
  } catch (_) {}
  const { data: priv } = await admin
    .from("profiles_private")
    .select("discord_user_id")
    .eq("user_id", userId)
    .maybeSingle();
  const discordId = priv?.discord_user_id ?? null;
  if (discordId) {
    try {
      const { sendDiscordDM } = await import("./discord.server");
      const res = await sendDiscordDM(
        discordId,
        `**${title}**\n\n${body}\n\n${SITE}${link}`,
        discordComponents,
      );
      if (!res.ok) console.error("Reserve DM failed", userId, res);
    } catch (e) {
      console.error("Reserve DM error", e);
    }
  }
}


/**
 * Find the next eligible waitlister and create a pending reserve offer.
 * Expiry depends on time until race:
 *   - < 5 hours to race: 1 hour
 *   - < 48 hours to race: 8 hours
 *   - otherwise: 24 hours
 * Internal helper — also called by respondReserveOffer (on decline) and the cron.
 */
async function offerNextReserveImpl(
  admin: any,
  params: { divisionId: string; absenteeUserId: string; carClass: string; driverCategory: string },
) {
  const { divisionId, absenteeUserId, carClass, driverCategory } = params;

  const { data: div } = await admin
    .from("divisions")
    .select("id,name,league_id,race_date,leagues(name)")
    .eq("id", divisionId)
    .maybeSingle();
  if (!div) return { ok: false, reason: "division_not_found" };

  // Don't offer if race already in past
  if (div.race_date && new Date(div.race_date) < new Date()) {
    return { ok: false, reason: "race_in_past" };
  }

  // Determine response window based on time until race
  let hoursToRespond = 24;
  let timeLabel = "24 timer";
  if (div.race_date) {
    const raceTime = new Date(div.race_date).getTime();
    const now = Date.now();
    const hoursUntilRace = (raceTime - now) / (1000 * 60 * 60);
    if (hoursUntilRace < 5) {
      hoursToRespond = 1;
      timeLabel = "1 time";
    } else if (hoursUntilRace < 48) {
      hoursToRespond = 8;
      timeLabel = "8 timer";
    }
  }

  // Candidates: waitlist entries in same class/category on this league
  const { data: waitlisters } = await admin
    .from("entries")
    .select("id,user_id,driver_name,created_at")
    .eq("league_id", div.league_id)
    .is("division_id", null)
    .eq("waitlist", true)
    .eq("car_class", carClass)
    .eq("driver_category", driverCategory)
    .order("created_at", { ascending: true });

  if (!waitlisters || waitlisters.length === 0) return { ok: false, reason: "no_waitlist" };

  const userIds = waitlisters.map((w: any) => w.user_id);
  const { data: profs } = await admin
    .from("profiles")
    .select("id,approved")
    .in("id", userIds);
  const approvedSet = new Set((profs ?? []).filter((p: any) => p.approved).map((p: any) => p.id));

  // Exclude those who already got an offer for this division (any status)
  const { data: priorOffers } = await admin
    .from("division_reserve_offers")
    .select("offered_user_id")
    .eq("division_id", divisionId);
  const alreadyOffered = new Set((priorOffers ?? []).map((o: any) => o.offered_user_id));

  // Exclude anyone who already has a division-level entry for this division
  const { data: divEntries } = await admin
    .from("entries")
    .select("user_id")
    .eq("division_id", divisionId);
  const alreadyOnDivision = new Set((divEntries ?? []).map((e: any) => e.user_id));

  const nextUp = waitlisters.find(
    (w: any) =>
      approvedSet.has(w.user_id) &&
      !alreadyOffered.has(w.user_id) &&
      !alreadyOnDivision.has(w.user_id) &&
      w.user_id !== absenteeUserId,
  );
  if (!nextUp) return { ok: false, reason: "no_eligible_candidate" };

  const expires = new Date(Date.now() + hoursToRespond * 60 * 60 * 1000).toISOString();
  const { data: offer, error: offerErr } = await admin
    .from("division_reserve_offers")
    .insert({
      division_id: divisionId,
      absentee_user_id: absenteeUserId,
      offered_user_id: nextUp.user_id,
      car_class: carClass,
      driver_category: driverCategory,
      status: "pending",
      expires_at: expires,
    })
    .select("id")
    .single();
  if (offerErr) {
    console.error("reserve offer insert failed", offerErr);
    return { ok: false, reason: "insert_failed" };
  }

  const ligaNavn = (div as any).leagues?.name ?? "ligaen";
  const afd = div.name;
  const { reserveOfferButtonsRow } = await import("./division-reserves.server");
  await notifyAndDM(
    admin,
    nextUp.user_id,
    `Reserveplads tilbudt — ${afd}`,
    `Du er tilbudt en reserveplads til afdelingen "${afd}" i ${ligaNavn} (${carClass} \u00b7 ${driverCategory}). ` +
      `Du har ${timeLabel} til at acceptere eller afsl\u00e5 tilbuddet \u2014 ellers g\u00e5r det videre til den n\u00e6ste p\u00e5 ventelisten. ` +
      `Bem\u00e6rk: pladsen g\u00e6lder kun denne ene afdeling. Bagefter er du tilbage p\u00e5 ventelisten med din nuv\u00e6rende plads i k\u00f8en.\n\n` +
      `Du kan svare direkte her i Discord eller p\u00e5 hjemmesiden.`,
    `/ligaer/${div.league_id}/afdeling/${divisionId}`,
    reserveOfferButtonsRow(offer.id),
  );


  return { ok: true, offerId: offer.id, offeredUserId: nextUp.user_id };
}

/** Called by absent user's UI after creating a division_absences row. */
export const triggerReserveOfferForAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ divisionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Verify absence exists
    const { data: abs } = await supabaseAdmin
      .from("division_absences")
      .select("id")
      .eq("division_id", data.divisionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!abs) return { ok: false, reason: "no_absence" };

    // Find user's league entry for the league this division belongs to
    const { data: div } = await supabaseAdmin
      .from("divisions")
      .select("id,name,league_id,leagues(name)")
      .eq("id", data.divisionId)
      .maybeSingle();
    if (!div) return { ok: false, reason: "no_division" };

    const { data: entry } = await supabaseAdmin
      .from("entries")
      .select("car_class,driver_category,waitlist")
      .eq("league_id", div.league_id)
      .is("division_id", null)
      .eq("user_id", userId)
      .maybeSingle();
    if (!entry || entry.waitlist) return { ok: false, reason: "not_on_grid" };

    // Confirm to the absentee that the abstention is registered
    const ligaNavn = (div as any)?.leagues?.name ?? "ligaen";
    const afd = div.name;
    await notifyAndDM(
      supabaseAdmin,
      userId,
      `Afbud registreret — ${afd}`,
      `Vi har registreret dit afbud til afdelingen "${afd}" i ${ligaNavn}. Vi forsøger nu at finde en reserve fra ventelisten, så din plads kan blive besat. Du behøver ikke foretage dig mere.`,
      `/ligaer/${div.league_id}/afdeling/${data.divisionId}`,
    );

    return await offerNextReserveImpl(supabaseAdmin, {
      divisionId: data.divisionId,
      absenteeUserId: userId,
      carClass: entry.car_class,
      driverCategory: entry.driver_category,
    });
  });

/** Called when absent user un-marks themselves. Voids pending offers and cancels accepted reserves. */
export const cancelReserveOffersForAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ divisionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: offers } = await supabaseAdmin
      .from("division_reserve_offers")
      .select("id,offered_user_id,status,car_class,driver_category")
      .eq("division_id", data.divisionId)
      .eq("absentee_user_id", userId)
      .in("status", ["pending", "accepted"]);

    const { data: div } = await supabaseAdmin
      .from("divisions")
      .select("id,name,league_id,leagues(name)")
      .eq("id", data.divisionId)
      .maybeSingle();
    const ligaNavn = (div as any)?.leagues?.name ?? "ligaen";
    const afd = div?.name ?? "afdelingen";

    for (const o of offers ?? []) {
      await supabaseAdmin
        .from("division_reserve_offers")
        .update({ status: "superseded", responded_at: new Date().toISOString() })
        .eq("id", o.id);

      if (o.status === "accepted") {
        // Remove reserve's division entry
        await supabaseAdmin
          .from("entries")
          .delete()
          .eq("division_id", data.divisionId)
          .eq("user_id", o.offered_user_id);

        await notifyAndDM(
          supabaseAdmin,
          o.offered_user_id,
          `Reserveplads annulleret — ${afd}`,
          `Den oprindelige kører i ${ligaNavn} (${o.car_class} · ${o.driver_category}) deltager alligevel, så din reserveplads til "${afd}" er annulleret. Du er stadig på ventelisten med din nuværende plads i køen.`,
          `/ligaer/${div?.league_id}/afdeling/${data.divisionId}`,
        );
      }
    }
    return { ok: true, cancelled: (offers ?? []).length };
  });

/** Reserve accepts or declines an offer. */
export const respondReserveOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ offerId: z.string().uuid(), accept: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { respondReserveOfferCore } = await import("./division-reserves.server");
    const res = await respondReserveOfferCore({
      offerId: data.offerId,
      accept: data.accept,
      actingUserId: context.userId,
    });
    switch (res.status) {
      case "not_found":
        throw new Error("Tilbud findes ikke");
      case "not_offered_to_you":
        throw new Error("Ikke dit tilbud");
      case "not_pending":
        throw new Error("Tilbuddet er ikke længere aktivt");
      case "expired":
        throw new Error("Tilbuddet er udløbet");
      case "no_league_entry":
        throw new Error("Du er ikke længere tilmeldt ligaen");
      case "error":
        throw new Error(res.message);
      case "accepted":
        return { ok: true, accepted: true };
      case "declined":
        return { ok: true, accepted: false };
    }
  });


/** Cron: mark expired offers and offer the next eligible. */
export async function expireStaleReserveOffersImpl() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: stale } = await supabaseAdmin
    .from("division_reserve_offers")
    .select("id,division_id,absentee_user_id,car_class,driver_category")
    .eq("status", "pending")
    .lt("expires_at", nowIso);

  let expired = 0;
  let newOffers = 0;
  for (const o of stale ?? []) {
    await supabaseAdmin
      .from("division_reserve_offers")
      .update({ status: "expired", responded_at: nowIso })
      .eq("id", o.id);
    expired++;
    const res = await offerNextReserveImpl(supabaseAdmin, {
      divisionId: o.division_id,
      absenteeUserId: o.absentee_user_id,
      carClass: o.car_class,
      driverCategory: o.driver_category,
    });
    if (res.ok) newOffers++;
  }
  return { expired, newOffers };
}

/** Re-offer the next eligible reserve after a decline. Server-only helper used by the Discord webhook. */
export async function offerNextReserveAfterDecline(params: {
  divisionId: string;
  absenteeUserId: string;
  carClass: string;
  driverCategory: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return offerNextReserveImpl(supabaseAdmin, params);
}

