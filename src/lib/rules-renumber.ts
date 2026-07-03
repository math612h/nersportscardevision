import { supabase } from "@/integrations/supabase/client";

/** Compare two section numbers like "3.2" vs "3.10" numerically. */
export function compareSectionNumbers(a: string | null | undefined, b: string | null | undefined): number {
  const as = String(a ?? "").split(".");
  const bs = String(b ?? "").split(".");
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const na = parseFloat(as[i] ?? "");
    const nb = parseFloat(bs[i] ?? "");
    const aValid = !isNaN(na);
    const bValid = !isNaN(nb);
    if (aValid && bValid) {
      if (na !== nb) return na - nb;
    } else if (aValid !== bValid) {
      return aValid ? -1 : 1;
    } else {
      const cmp = (as[i] ?? "").localeCompare(bs[i] ?? "");
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * If a rule with the same section_number already exists in the same main section,
 * shift it (and all following subsections in that main section) by +1.
 * e.g. inserting 3.4 while 3.4, 3.5 exist → 3.4 becomes 3.5, 3.5 becomes 3.6.
 * Only shifts numeric subsections of the form "<main>.<int>".
 */
export async function shiftRuleNumbersForInsert(params: {
  table: "rulesets" | "ruleset_template_rules";
  scopeColumn: "league_id" | "template_id";
  scopeValue: string;
  newSectionNumber: string;
  excludeRuleId?: string;
}) {
  const { table, scopeColumn, scopeValue, newSectionNumber, excludeRuleId } = params;
  const parts = String(newSectionNumber).split(".");
  if (parts.length < 2) return;
  const main = parts[0];
  const newSub = parseInt(parts[1], 10);
  if (isNaN(newSub)) return;

  const { data, error } = await supabase
    .from(table)
    .select("id, section_number")
    .eq(scopeColumn, scopeValue);
  if (error || !data) return;

  const toShift = data
    .filter((r: any) => {
      if (excludeRuleId && r.id === excludeRuleId) return false;
      const p = String(r.section_number ?? "").split(".");
      if (p.length < 2 || p[0] !== main) return false;
      const sub = parseInt(p[1], 10);
      return !isNaN(sub) && sub >= newSub;
    })
    .sort((a: any, b: any) => {
      const sa = parseInt(String(a.section_number).split(".")[1], 10);
      const sb = parseInt(String(b.section_number).split(".")[1], 10);
      return sb - sa; // update largest first to avoid unique-collisions if any
    });

  // Only shift if there is an actual collision at newSub
  if (!toShift.some((r: any) => parseInt(String(r.section_number).split(".")[1], 10) === newSub)) return;

  for (const r of toShift as any[]) {
    const p = String(r.section_number).split(".");
    const sub = parseInt(p[1], 10);
    const rest = p.slice(2).join(".");
    const next = `${main}.${sub + 1}${rest ? "." + rest : ""}`;
    await supabase.from(table).update({ section_number: next }).eq("id", r.id);
  }
}
