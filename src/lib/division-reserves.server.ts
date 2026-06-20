// Server-only core for accepting/declining a division reserve offer.
// Shared by the in-app server function and the Discord interactions webhook.

const SITE = "https://lmudanmark.dk";

async function notifyAndDMSimple(
  admin: any,
  userId: string,
  title: string,
  body: string,
  link: string,
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
      await sendDiscordDM(discordId, `**${title}**\n\n${body}\n\n${SITE}${link}`);
    } catch (_) {}
  }
}

export type ReserveOfferResponseResult =
  | { status: "accepted"; afd: string; ligaNavn: string; carClass: string; driverCategory: string }
  | { status: "declined"; afd: string; ligaNavn: string }
  | { status: "expired" }
  | { status: "not_found" }
  | { status: "not_pending" }
  | { status: "not_offered_to_you" }
  | { status: "no_league_entry" }
  | { status: "error"; message: string };

export async function respondReserveOfferCore(opts: {
  offerId: string;
  accept: boolean;
  actingUserId: string;
}): Promise<ReserveOfferResponseResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { offerId, accept, actingUserId } = opts;

  const { data: offer, error: oErr } = await supabaseAdmin
    .from("division_reserve_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();
  if (oErr || !offer) return { status: "not_found" };
  if (offer.offered_user_id !== actingUserId) return { status: "not_offered_to_you" };
  if (offer.status !== "pending") return { status: "not_pending" };
  if (new Date(offer.expires_at) < new Date()) {
    await supabaseAdmin
      .from("division_reserve_offers")
      .update({ status: "expired", responded_at: new Date().toISOString() })
      .eq("id", offer.id);
    return { status: "expired" };
  }

  const { data: div } = await supabaseAdmin
    .from("divisions")
    .select("id,name,league_id,leagues(name)")
    .eq("id", offer.division_id)
    .maybeSingle();
  const ligaNavn = (div as any)?.leagues?.name ?? "ligaen";
  const afd = (div as any)?.name ?? "afdelingen";

  if (accept) {
    const { data: leagueEntry } = await supabaseAdmin
      .from("entries")
      .select("driver_name,car_number")
      .eq("league_id", (div as any)!.league_id)
      .is("division_id", null)
      .eq("user_id", actingUserId)
      .maybeSingle();
    if (!leagueEntry) return { status: "no_league_entry" };

    const { error: insErr } = await supabaseAdmin.from("entries").insert({
      division_id: offer.division_id,
      league_id: (div as any)!.league_id,
      user_id: actingUserId,
      driver_name: (leagueEntry as any).driver_name,
      car_class: offer.car_class,
      driver_category: offer.driver_category,
      car_number: (leagueEntry as any).car_number,
      waitlist: false,
    });
    if (insErr) return { status: "error", message: insErr.message };

    await supabaseAdmin
      .from("division_reserve_offers")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", offer.id);

    await notifyAndDMSimple(
      supabaseAdmin,
      actingUserId,
      `Reserveplads bekræftet — ${afd}`,
      `Du er nu på griddet til "${afd}" i ${ligaNavn} (${offer.car_class} · ${offer.driver_category}). Pladsen gælder kun denne ene afdeling — bagefter er du tilbage på ventelisten med din nuværende plads i køen.`,
      `/ligaer/${(div as any)!.league_id}/afdeling/${offer.division_id}`,
    );
    await notifyAndDMSimple(
      supabaseAdmin,
      offer.absentee_user_id,
      `Reserve fundet til ${afd}`,
      `En reserve har taget din plads til "${afd}" i ${ligaNavn}.`,
      `/ligaer/${(div as any)!.league_id}/afdeling/${offer.division_id}`,
    );
    return {
      status: "accepted",
      afd,
      ligaNavn,
      carClass: offer.car_class,
      driverCategory: offer.driver_category,
    };
  } else {
    await supabaseAdmin
      .from("division_reserve_offers")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", offer.id);

    // Offer to next eligible
    try {
      const { offerNextReserveAfterDecline } = await import("./division-reserves.functions");
      await offerNextReserveAfterDecline({
        divisionId: offer.division_id,
        absenteeUserId: offer.absentee_user_id,
        carClass: offer.car_class,
        driverCategory: offer.driver_category,
      });
    } catch (_) {}

    return { status: "declined", afd, ligaNavn };
  }
}

/** Discord MessageComponent V1: two-button action row for accept/decline. */
export function reserveOfferButtonsRow(offerId: string) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3, // success / green
          label: "Accepter pladsen",
          custom_id: `reserve_accept:${offerId}`,
          emoji: { name: "✅" },
        },
        {
          type: 2,
          style: 4, // danger / red
          label: "Afvis",
          custom_id: `reserve_decline:${offerId}`,
          emoji: { name: "❌" },
        },
      ],
    },
  ];
}
