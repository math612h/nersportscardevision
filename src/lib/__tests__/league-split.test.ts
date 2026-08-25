import { describe, expect, it } from "vitest";
import { buildAutomaticSplit, sortSplitDrivers, validateSplitAssignment, type SplitDriver } from "@/lib/league-split";

const driver = (entryId: string, score: number | null, percentile: number | null, hasRating = true): SplitDriver => ({
  entry_id: entryId,
  user_id: `user-${entryId}`,
  driver_name: `Kører ${entryId}`,
  score,
  percentile,
  hasRating,
});

describe("league split", () => {
  it("sorts by class rating instead of assigning a shared default score", () => {
    const sorted = sortSplitDrivers([
      driver("bronze", 18, 12),
      driver("gold", 76, 96),
      driver("silver", 52, 72),
    ]);
    expect(sorted.map((row) => row.entry_id)).toEqual(["gold", "silver", "bronze"]);
  });

  it("puts unrated drivers below rated drivers with a stable name tie-breaker", () => {
    const sorted = sortSplitDrivers([
      { ...driver("b", null, null, false), driver_name: "Bo" },
      driver("rated", 10, 5),
      { ...driver("a", null, null, false), driver_name: "Anders" },
    ]);
    expect(sorted.map((row) => row.entry_id)).toEqual(["rated", "a", "b"]);
  });

  it("creates non-empty automatic groups", () => {
    const split = buildAutomaticSplit([driver("1", 90, 95), driver("2", 70, 75), driver("3", 30, 25)]);
    expect(split.proDrivers.length).toBeGreaterThan(0);
    expect(split.amDrivers.length).toBeGreaterThan(0);
    expect(split.proDrivers[0]?.entry_id).toBe("1");
  });

  it("rejects incomplete, duplicate, and empty assignments", () => {
    expect(() => validateSplitAssignment(["1", "2"], ["1"], ["2"])).not.toThrow();
    expect(() => validateSplitAssignment(["1", "2"], ["1"], ["1"])).toThrow();
    expect(() => validateSplitAssignment(["1", "2"], ["1"], [])).toThrow();
    expect(() => validateSplitAssignment(["1", "2"], ["1"], ["3"])).toThrow();
  });
});