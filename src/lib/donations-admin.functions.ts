import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  userId: z.string().uuid(),
  tier: z.enum(["bronze", "silver", "gold"]).nullable(),
  totalDkk: z.number().int().min(0).max(1000000).optional(),
  note: z.string().max(500).nullable().optional(),
});

export const setDonationTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
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
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, display_name, lmu_name, donation_tier, donation_total_dkk, donation_note")
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as any[] };
  });
