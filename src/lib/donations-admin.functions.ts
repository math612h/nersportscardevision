import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listDonationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name, lmu_name, donation_tier, donation_total_dkk")
      .gt("donation_total_dkk", 0)
      .order("donation_total_dkk", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as any[] };
  });

export const searchUsersForDonation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ q: z.string().min(1).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const needle = `%${data.q}%`;
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name, lmu_name, donation_total_dkk, donation_tier")
      .or(`display_name.ilike.${needle},lmu_name.ilike.${needle}`)
      .limit(20);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

export const listUserDonations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("donations")
      .select("id, amount_dkk, note, donated_at, created_at")
      .eq("user_id", data.userId)
      .order("donated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

export const addDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        amountDkk: z.number().int().positive().max(1000000),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("donations").insert({
      user_id: data.userId,
      amount_dkk: data.amountDkk,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("donations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
