// Pure helpers for the public ICE Cup broadcast endpoint.
// No database access here so the mapping logic can be unit-tested.

export const ICE_CUP_LEAGUE_NAME_MATCH = "ice cup";

export type BroadcastClass = {
  id: string;
  name: string;
  lmuClass: string;
};

export const BROADCAST_CLASSES: BroadcastClass[] = [
  { id: "hypercar", name: "Hypercar", lmuClass: "Hypercar" },
  { id: "lmp2", name: "LMP2", lmuClass: "LMP2" },
  { id: "lmgt3", name: "LMGT3", lmuClass: "LMGT3" },
  { id: "lmgt3-pro", name: "LMGT3 PRO", lmuClass: "LMGT3" },
  { id: "lmgt3-am", name: "LMGT3 AM", lmuClass: "LMGT3" },
];

export function classNameFor(id: string): string {
  return BROADCAST_CLASSES.find((c) => c.id === id)?.name ?? id;
}

export type RawEntry = {
  user_id: string;
  driver_name: string | null;
  car_number: number | null;
  car_class: string | null;
  driver_category: string | null;
  waitlist: boolean | null;
  team_id: string | null;
};

export type BroadcastEntry = {
  driverId: string;
  driverName: string;
  carNumber: string;
  lmuClass: string;
  broadcastClass: string;
  classId: string;
  className: string;
  teamId: string | null;
  teamName: string | null;
  avatarUrl: string | null;
  category?: "PRO" | "AM";
};

export function normalizeLmuClass(carClass: string | null | undefined): string | null {
  const c = (carClass ?? "").trim().toLowerCase();
  if (!c) return null;
  if (c.includes("hyper") || c === "lmh" || c === "lmdh") return "Hypercar";
  if (c.includes("lmp2")) return "LMP2";
  if (c.includes("gt3")) return "LMGT3";
  return null;
}

export function broadcastClassId(
  lmuClass: string,
  driverCategory: string | null | undefined,
): string | null {
  if (lmuClass === "Hypercar") return "hypercar";
  if (lmuClass === "LMP2") return "lmp2";
  if (lmuClass === "LMGT3") {
    // Category comes straight from the entry list (entries.driver_category),
    // which is what the site renders. No car-model or hardcoded mapping.
    const cat = (driverCategory ?? "").trim().toLowerCase();
    if (cat === "am" || cat.startsWith("am") || cat.includes(" am")) return "lmgt3-am";
    if (cat === "pro" || cat.startsWith("pro")) return "lmgt3-pro";
    return "lmgt3"; // class not split (e.g. "Open")
  }
  return null;
}

/** Only approved, non-waitlisted entries are exposed. */
export function isPublicEntry(
  entry: RawEntry,
  profileApproved: boolean | null | undefined,
): boolean {
  return profileApproved === true && entry.waitlist !== true;
}

export function buildEntries(
  rows: RawEntry[],
  ctx: {
    approvedByUser: Map<string, boolean>;
    nameByUser: Map<string, string>;
    avatarByUser: Map<string, string | null>;
    teamNameById: Map<string, string>;
  },
): BroadcastEntry[] {
  const out: BroadcastEntry[] = [];
  for (const e of rows) {
    if (!isPublicEntry(e, ctx.approvedByUser.get(e.user_id))) continue;
    const lmuClass = normalizeLmuClass(e.car_class);
    if (!lmuClass) continue;
    const bc = broadcastClassId(lmuClass, e.driver_category);
    if (!bc) continue;
    if (e.car_number == null) continue;
    out.push({
      driverId: e.user_id,
      driverName: ctx.nameByUser.get(e.user_id) || (e.driver_name ?? ""),
      carNumber: String(e.car_number),
      lmuClass,
      broadcastClass: bc,
      classId: bc,
      className: classNameFor(bc),
      teamId: e.team_id ?? null,
      teamName: e.team_id ? (ctx.teamNameById.get(e.team_id) ?? null) : null,
      avatarUrl: ctx.avatarByUser.get(e.user_id) ?? null,
      ...(bc === "lmgt3-pro" ? { category: "PRO" as const } : {}),
      ...(bc === "lmgt3-am" ? { category: "AM" as const } : {}),
    });
  }
  out.sort((a, b) => Number(a.carNumber) - Number(b.carNumber));
  return out;
}
