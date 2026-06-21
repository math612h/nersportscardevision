import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Kun admins");
}

export const listCronJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_list_cron_jobs" as any);
    if (error) throw error;
    return data ?? [];
  });

export const listCronRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("admin_list_cron_runs" as any, { _limit: data.limit });
    if (error) throw error;
    return rows ?? [];
  });

// Liste af interne cron-endpoints man kan trigge manuelt
const TRIGGERS = [
  { key: "delete-expired-host-sessions", label: "Slet udløbne hosted sessions" },
  { key: "expire-reserve-offers", label: "Udløb reserve-tilbud" },
  { key: "league-open", label: "Åbn liga-tilmeldinger" },
  { key: "strip-unverified-members", label: "Fjern rolle fra uverificerede" },
] as const;

export const listCronTriggers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    return TRIGGERS as unknown as Array<{ key: string; label: string }>;
  });

export const runCronJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const allowed = TRIGGERS.find((t) => t.key === data.key);
    if (!allowed) throw new Error("Ukendt job");

    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!apiKey) throw new Error("Mangler nøgle");
    const base =
      process.env.SITE_URL ||
      process.env.VITE_SITE_URL ||
      "https://lmudanmark-dk.lovable.app";
    const url = `${base.replace(/\/$/, "")}/api/public/cron/${allowed.key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: "{}",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

    await context.supabase.rpc("log_audit" as any, {
      _action: "cron_run",
      _table: "cron",
      _row_id: allowed.key,
      _metadata: { result: text.slice(0, 500) } as any,
    });

    return { ok: true as const, status: res.status, body: text.slice(0, 500) };
  });
