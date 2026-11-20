import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { approvedCutoffUnix, endingBalanceFromCsv } from "./stripe-report";

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
    const { createStripeClient, getStripeErrorMessage, getConnectionApiKey } = await import("@/lib/stripe.server");
    try {
      await requireFin(context.supabase);
      const stripe = createStripeClient("live");
      const run = await stripe.reporting.reportRuns.retrieve(data.id);
      if (run.status === "pending") return { status: "pending" as const };
      if (run.status === "failed") return { error: `Stripe-rapporten fejlede: ${run.error ?? "ukendt fejl"}` };
      const url = run.result?.url;
      if (!url) return { error: "Stripe-rapporten har ingen fil" };
      const gw = url.replace(/^https:\/\/files\.stripe\.com/, "https://connector-gateway.lovable.dev/stripe");
      const res = await fetch(gw, {
        headers: { "X-Connection-Api-Key": getConnectionApiKey("live"), "Lovable-API-Key": process.env["LOVABLE_API_KEY"] ?? "" },
      });
      const body = await res.text();
      if (!res.ok) {
        const msg = `Kunne ikke hente Stripe-CSV [${res.status}]: ${body.slice(0, 300)}`;
        return { error: res.status === 401 || res.status === 403 ? `${NO_ACCESS} ${msg}` : msg };
      }
      let endingMinor: number;
      try { endingMinor = endingBalanceFromCsv(body); }
      catch (e) { return { error: (e as Error).message, csv: body, runId: run.id }; }
      return { status: "succeeded" as const, runId: run.id, createdAt: new Date(run.created * 1000).toISOString(), endingMinor, csv: body };
    } catch (e) {
      return { error: errMsg(e, getStripeErrorMessage) };
    }
  });
