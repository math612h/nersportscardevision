import { supabase } from "@/integrations/supabase/client";

/**
 * Swap a league with its neighbor (up/down) within the given ordered list,
 * then normalize sort_order across the entire list so ordering is deterministic
 * even when every row started at sort_order = 0.
 */
export async function reorderLeaguesSwap(
  list: { id: string }[],
  id: string,
  dir: "up" | "down",
) {
  const idx = list.findIndex((l) => l.id === id);
  if (idx < 0) return;
  const otherIdx = dir === "up" ? idx - 1 : idx + 1;
  if (otherIdx < 0 || otherIdx >= list.length) return;
  const next = [...list];
  [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
  const results = await Promise.all(
    next.map((l, i) =>
      supabase.from("leagues").update({ sort_order: i * 10 } as any).eq("id", l.id),
    ),
  );
  for (const r of results) if (r.error) throw r.error;
}
