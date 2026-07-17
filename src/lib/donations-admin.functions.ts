import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  userId: z.string().uuid(),
  tier: z.enum(["bronze", "silver", "gold"]).nullable(),
  totalDkk: z.number().int().min(0).max(1000000).optional(),
  note: z.string().max(500).nullable().optional(),
});

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

export const setDonationTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => schema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { donation_tier: data.tier };
    if (data.totalDkk !== undefined) patch.donation_total_dkk = data.totalDkk;
    if (data.note !== undefined) patch.donation_note = data.note;
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update(patch)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDonationProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name, lmu_name, donation_tier, donation_total_dkk, donation_note")
      .order("display_name", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as any[] };
  });
