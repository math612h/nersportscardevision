import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "./stripe.server";

const environmentSchema = z.enum(["sandbox", "live"]);

type SessionResult = { clientSecret: string } | { error: string };

/**
 * Create a Stripe Checkout session for a free-form donation ("køb os en kaffe").
 * On completion, the webhook records a `donations` row (source='donation'),
 * which triggers automatic donor-tier recomputation.
 */
export const createDonationCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        amountDkk: z.number().int().min(5).max(50000),
        returnUrl: z.string().url(),
        environment: environmentSchema,
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<SessionResult> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const { data: { user } } = await context.supabase.auth.getUser();
      const email = user?.email ?? undefined;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded",
        return_url: data.returnUrl,
        line_items: [
          {
            price_data: {
              currency: "dkk",
              product_data: { name: "Donation til LMU Danmark" },
              unit_amount: data.amountDkk * 100,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          description: "Donation til LMU Danmark",
          metadata: {
            userId: context.userId,
            kind: "donation",
            amount_dkk: String(data.amountDkk),
          },
        },
        metadata: {
          userId: context.userId,
          kind: "donation",
          amount_dkk: String(data.amountDkk),
        },
        ...(email && { customer_email: email }),
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      console.error("createDonationCheckout error", error);
      return { error: getStripeErrorMessage(error) };
    }
  });

const focusPointsSchema = z.array(z.string()).min(1).max(10);

/**
 * Coaching booking + payment in one step:
 * 1. Insert a coaching_bookings row with status='pending' and paid_at=null.
 * 2. Create a Stripe Checkout session tied to that booking id via metadata.
 * 3. Webhook flips paid_at when payment succeeds and THEN notifies the coach
 *    on Discord. The coach still confirms with server name + code + channel.
 */
export const createCoachingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        coach_user_id: z.string().uuid(),
        focus_points: focusPointsSchema,
        duration_minutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
        track: z.string().min(1).max(100),
        layout: z.string().max(100).nullable(),
        starts_at: z.string(),
        extra_info: z.string().max(2000).nullable(),
        returnUrl: z.string().url(),
        environment: environmentSchema,
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<SessionResult & { bookingId?: string }> => {
    const priceMap: Record<number, number> = { 30: 30, 45: 40, 60: 50 };
    const amountDkk = priceMap[data.duration_minutes];
    if (!amountDkk) return { error: "Ugyldig varighed" };

    if (!data.starts_at || isNaN(new Date(data.starts_at).getTime())) {
      return { error: "Ugyldigt starttidspunkt" };
    }

    // Create booking row up front so we have a stable id to attach to Stripe session.
    const { data: booking, error: bookingErr } = await context.supabase
      .from("coaching_bookings")
      .insert({
        user_id: context.userId,
        coach_user_id: data.coach_user_id,
        focus_points: data.focus_points,
        duration_minutes: data.duration_minutes,
        track: data.track,
        layout: data.layout,
        starts_at: new Date(data.starts_at).toISOString(),
        extra_info: data.extra_info,
        status: "pending",
        amount_dkk: amountDkk,
      })
      .select("id")
      .single();
    if (bookingErr || !booking) {
      return { error: bookingErr?.message ?? "Kunne ikke oprette booking" };
    }

    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const { data: { user } } = await context.supabase.auth.getUser();
      const email = user?.email ?? undefined;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ui_mode: "embedded",
        return_url: data.returnUrl,
        line_items: [
          {
            price_data: {
              currency: "dkk",
              product_data: {
                name: `Coaching-session (${data.duration_minutes} min)`,
              },
              unit_amount: amountDkk * 100,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          description: `Coaching-session (${data.duration_minutes} min)`,
          metadata: {
            userId: context.userId,
            kind: "coaching",
            booking_id: booking.id,
            amount_dkk: String(amountDkk),
          },
        },
        metadata: {
          userId: context.userId,
          kind: "coaching",
          booking_id: booking.id,
          amount_dkk: String(amountDkk),
        },
        ...(email && { customer_email: email }),
      } as any);

      // Persist the session id so we can resume the same checkout on refresh.
      await context.supabase
        .from("coaching_bookings")
        .update({ stripe_session_id: session.id })
        .eq("id", booking.id);

      return { clientSecret: session.client_secret ?? "", bookingId: booking.id };
    } catch (error) {
      console.error("createCoachingCheckout error", error);
      // Roll back the booking so the user can retry.
      await context.supabase.from("coaching_bookings").delete().eq("id", booking.id);
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Look up a checkout session status (used on the return page). */
export const getCheckoutSessionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ sessionId: z.string().min(1), environment: environmentSchema }).parse(i),
  )
  .handler(async ({ data }): Promise<{ status: string; paymentStatus: string } | { error: string }> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      return {
        status: session.status ?? "unknown",
        paymentStatus: session.payment_status ?? "unknown",
      };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
