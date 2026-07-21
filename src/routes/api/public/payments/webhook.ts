import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook, type StripeEnv } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

const COACHING_CHANNEL_ID = "1529100842420928633";
const DONATION_CHANNEL_ID = "1529100885794488461";

async function postPaymentToDiscord(userId: string, amountDkk: number, source: "donation" | "coaching") {
  try {
    const sb = getSupabase() as any;
    const { data: profile } = await sb
      .from("profiles")
      .select("display_name, lmu_name")
      .eq("id", userId)
      .maybeSingle();
    const name = (profile as any)?.display_name?.trim() || (profile as any)?.lmu_name?.trim() || "Ukendt bruger";
    const { sendDiscordChannelMessage } = await import("@/lib/discord.server");
    const emoji = source === "coaching" ? "🏁" : "☕";
    const label = source === "coaching" ? "Ny coaching-session solgt" : "Ny donation modtaget";
    const content = `${emoji} **${label}**\n**${name}** har betalt **${amountDkk} kr.** 🙏`;
    const channelId = source === "coaching" ? COACHING_CHANNEL_ID : DONATION_CHANNEL_ID;
    await sendDiscordChannelMessage(channelId, content).catch(() => {});
  } catch (e) {
    console.error("[payments-webhook] postPaymentToDiscord failed", e);
  }
}

async function sendThankYou(userId: string, amountDkk: number, source: "donation" | "coaching") {
  const sb = getSupabase() as any;
  const { data: profile } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = (profile as any)?.display_name?.trim() || "ven";
  const title = "Tusind tak for din donation 🙏";
  const kindLine =
    source === "coaching"
      ? `Din betaling for coaching-sessionen på ${amountDkk} kr. tæller også som en donation og støtter driften af LMU Danmark.`
      : `Tusind tak for din donation på ${amountDkk} kr. Din donation er med til at bære os videre mod at blive et endnu bedre fællesskab.`;
  const body =
    `Hej ${name}!\n\n${kindLine}\n\n` +
    `Din donation vil gå til blandt andet hjemmeside, domæne, servere, administration og stream.\n\n` +
    `Igen tusind tak 🙏`;
  const link = "/donationer";

  await sb.from("notifications").insert({
    user_id: userId,
    title,
    body,
    link,
  });

  try {
    const { data: priv } = await sb
      .from("profiles_private")
      .select("discord_user_id")
      .eq("user_id", userId)
      .maybeSingle();
    const discordUserId = (priv as any)?.discord_user_id ?? null;
    if (discordUserId) {
      const { sendDiscordDM } = await import("@/lib/discord.server");
      await sendDiscordDM(discordUserId, `**${title}**\n\n${body}`).catch(() => {});
    }
  } catch (_) {}
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const sb = getSupabase() as any;
  const md = session.metadata ?? {};
  const kind = md.kind as string | undefined;
  const userId = md.userId as string | undefined;
  const amountDkk = Number(md.amount_dkk ?? 0);

  if (!userId || !amountDkk || !kind) {
    console.warn("[payments-webhook] missing metadata", { kind, userId, amountDkk });
    return;
  }
  if (session.payment_status !== "paid") {
    console.log("[payments-webhook] session not paid yet", session.payment_status);
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  if (kind === "donation") {
    // Idempotent insert on unique stripe_session_id
    const { error } = await sb.from("donations").insert({
      user_id: userId,
      amount_dkk: amountDkk,
      source: "donation",
      note: "Betalt via Stripe",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      environment: env,
    });
    if (error && !error.message.includes("duplicate")) {
      console.error("[payments-webhook] donation insert error", error);
      return;
    }
    await sendThankYou(userId, amountDkk, "donation");
    await postPaymentToDiscord(userId, amountDkk, "donation");
    return;
  }


  if (kind === "coaching") {
    const bookingId = md.booking_id as string | undefined;
    if (!bookingId) {
      console.warn("[payments-webhook] coaching without booking_id");
      return;
    }

    // Idempotency: only act if not already marked paid.
    const { data: existing } = await sb
      .from("coaching_bookings")
      .select("id, paid_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (!existing) {
      console.warn("[payments-webhook] booking not found", bookingId);
      return;
    }
    if ((existing as any).paid_at) {
      return; // already processed
    }

    await sb
      .from("coaching_bookings")
      .update({
        paid_at: new Date().toISOString(),
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", bookingId);

    // Record as a donation too (source='coaching') so it feeds donor tier
    const { error: donErr } = await sb.from("donations").insert({
      user_id: userId,
      amount_dkk: amountDkk,
      source: "coaching",
      note: `Coaching-session #${bookingId.slice(0, 8)}`,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      environment: env,
    });
    if (donErr && !donErr.message.includes("duplicate")) {
      console.error("[payments-webhook] coaching-as-donation insert error", donErr);
    }

    // Now notify coach on Discord (coach confirms with server info + channel).
    try {
      const { notifyCoachOfNewBooking } = await import("@/lib/coaching-discord.server");
      await notifyCoachOfNewBooking(bookingId);
    } catch (e) {
      console.error("[payments-webhook] notifyCoachOfNewBooking failed", e);
    }

    await sendThankYou(userId, amountDkk, "coaching");
    await postPaymentToDiscord(userId, amountDkk, "coaching");
    return;
  }

  console.warn("[payments-webhook] unknown kind", kind);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "checkout.session.async_payment_failed":
      console.log("[payments-webhook] async payment failed", event.data.object?.id);
      break;
    default:
      // Silent ignore for events we don't care about.
      break;
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
