import { describe, it, expect } from "vitest";
import {
  buildEntries,
  broadcastClassId,
  isPublicEntry,
  normalizeLmuClass,
  type RawEntry,
} from "@/lib/broadcast-ice-cup";

const ctx = {
  approvedByUser: new Map([
    ["u1", true],
    ["u2", false],
    ["u3", true],
  ]),
  nameByUser: new Map([
    ["u1", "Mathias Skov"],
    ["u2", "Afvist Bruger"],
    ["u3", "Anders And"],
  ]),
  avatarByUser: new Map<string, string | null>([["u1", "https://cdn/avatar.png"]]),
  teamNameById: new Map([["t1", "Frontline Motorsport"]]),
};

const rows: RawEntry[] = [
  { user_id: "u1", driver_name: "Mathias", car_number: 30, car_class: "LMGT3", driver_category: "Pro", waitlist: false, team_id: "t1" },
  { user_id: "u2", driver_name: "Afvist", car_number: 31, car_class: "LMGT3", driver_category: "Pro", waitlist: false, team_id: null },
  { user_id: "u3", driver_name: "Venteliste", car_number: 32, car_class: "LMP2", driver_category: "Open", waitlist: true, team_id: null },
];

describe("ice-cup broadcast payload", () => {
  it("maps LMU classes and broadcast classes", () => {
    expect(normalizeLmuClass("LMGT3")).toBe("LMGT3");
    expect(normalizeLmuClass("Hypercar")).toBe("Hypercar");
    expect(broadcastClassId("LMGT3", "Am")).toBe("lmgt3-am");
    expect(broadcastClassId("LMGT3", "Pro")).toBe("lmgt3-pro");
    expect(broadcastClassId("LMGT3", "Open")).toBe("lmgt3");
    expect(broadcastClassId("LMP2", null)).toBe("lmp2");
  });

  it("excludes unapproved and waitlisted entries", () => {
    expect(isPublicEntry(rows[1]!, false)).toBe(false);
    expect(isPublicEntry(rows[2]!, true)).toBe(false);
    const entries = buildEntries(rows, ctx);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.driverId).toBe("u1");
    expect(JSON.stringify(entries)).not.toContain("Afvist");
    expect(JSON.stringify(entries)).not.toContain("Venteliste");
  });

  it("never leaks private fields", () => {
    const entries = buildEntries(rows, ctx);
    const keys = Object.keys(entries[0]!).sort();
    expect(keys).toEqual([
      "avatarUrl",
      "broadcastClass",
      "carNumber",
      "classId",
      "className",
      "driverId",
      "driverName",
      "lmuClass",
      "teamId",
      "teamName",
    ]);
    const blob = JSON.stringify(entries);
    for (const forbidden of ["email", "discord", "age", "address", "phone", "postal"]) {
      expect(blob.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("matches LMU live data on carNumber + lmuClass", () => {
    const e = buildEntries(rows, ctx)[0]!;
    expect(`${e.carNumber}|${e.lmuClass}`).toBe("30|LMGT3");
  });
});
