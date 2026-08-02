import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RepairReport } from "@/lib/leaderboard-repair.server";

export type { RepairChange, RepairReport } from "@/lib/leaderboard-repair.server";

/**
 * Genberegner leaderboard-poster der stammer fra én konkret resultatfil.
 * apply=false giver en ren forhåndsvisning (ingen skrivninger).
 */
export const recomputeResultFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ xml: z.string().min(20).max(20_000_000), apply: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }): Promise<RepairReport> => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!role) throw new Error("Kun admins");
    const { recomputeFromResultFile } = await import("@/lib/leaderboard-repair.server");
    return recomputeFromResultFile(data.xml, data.apply);
  });
