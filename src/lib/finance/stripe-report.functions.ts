import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { approvedCutoffUnix } from "./stripe-report";

const NO_ACCESS = "Stripe Live-nøglen har ikke adgang til rapporter. Giv nøglen læseadgang til Reporting / Report runs.";

async function requireFin(supabase: any) {
  const { data, error } = await supabase.rpc("fin_my_roles");
  if (error) throw new Error(error.message);
  if (!((data ?? []) as string[]).length) throw new Error("Ingen økonomiadgang");
}

function errMsg(e: any, getMsg: (e: unknown) => string): string {
  const status = e?.statusCode ?? e?.raw?.statusCode;
  const text = getMsg(e);
  if (status === 401 || status === 403 || /permission|not have access|restricted key/i.test(text)) return `${NO_ACCESS} (${text})`;
  return text;
}

export const startCutoffBalanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      await requireFin(context.supabase);
      const { data: s, error } = await context.supabase.from("fin_settings").select("cutoff_at, cutoff_approved_at").eq("id", 1).single();
      if (error) throw new Error(error.message);
      const cutoff = approvedCutoffUnix(s as any);
      const stripe = createStripeClient("live");
      const rt = await stripe.reporting.reportTypes.retrieve("balance.summary.2");
      if (rt.data_available_end < cutoff) {
        return { error: `Stripe har kun data til ${new Date(rt.data_available_end * 1000).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })} – ikke til skæringspunktet endnu.` };
      }
      const run = await stripe.reporting.reportRuns.create({
        report_type: "balance.summary.2",
        parameters: { interval_start: rt.data_available_start, interval_end: cutoff, currency: "dkk" },
      });
      return { id: run.id, cutoff: new Date(cutoff * 1000).toISOString() };
    } catch (e) {
      return { error: errMsg(e, getStripeErrorMessage) };
    }
  });

export const getCutoffBalanceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().regex(/^frr_[A-Za-z0-9]+$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
    try {
      await requireFin(context.supabase);
      const stripe = createStripeClient("live");
      const run = await stripe.reporting.reportRuns.retrieve(data.id);
      if (run.status === "pending") return { status: "pending" as const };
      if (run.status === "failed") return { error: `Stripe-rapporten fejlede: ${run.error ?? "ukendt fejl"}` };
      const url = run.result?.url;
      if (!url) return { error: "Stripe-rapporten har ingen fil" };
      let host = "";
      try { host = new URL(url).hostname; } catch { /* invalid */ }
      if (host !== "files.stripe.com") return { error: `Uventet filvært for Stripe-rapporten (${host || "ugyldig URL"}). Forventede files.stripe.com.` };
      // The Stripe Live gateway connection only reaches api.stripe.com; rewriting files.stripe.com there returns 404.
      return { error: "Rapporten er klar hos Stripe, men der er ingen serverforbindelse til files.stripe.com, så den originale CSV kan ikke hentes. Den historiske saldo vises først, når CSV'en er læst.", runId: run.id };
          } catch (e) {
      return { error: errMsg(e, getStripeErrorMessage) };
    }
  });
