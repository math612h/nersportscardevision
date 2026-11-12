import { describe, it, expect } from "vitest";
import { joinerEligibleFrom, joinerEligibilityByKey, type JoinerDivision } from "./joiner-eligibility";

const r1: JoinerDivision = { id: "d1", raceTs: Date.parse("2026-09-02T17:00:00Z"), results: [] };
const r6: JoinerDivision = {
  id: "d6",
  raceTs: Date.parse("2026-11-11T18:00:00Z"),
  results: [
    { user_id: "esben", car_class: "LMGT3", status: "classified" },
    { user_id: "noshow", car_class: "LMGT3", dns: true, status: "dns" },
  ],
};
const divs = [r1, r6];

describe("tiltrædelsespoint for reserver", () => {
  it("en reserve der kørte afdelingen får point for alle tidligere afdelinger", () => {
    const ts = joinerEligibleFrom(
      { user_id: "esben", car_class: "LMGT3", created_at: "2026-11-11T17:43:00Z", division_id: "d6", waitlist: false },
      divs,
    );
    expect(ts).toBe(r6.raceTs);
  });

  it("en reserve der ikke stillede op (DNS) får ingen tiltrædelsespoint", () => {
    expect(joinerEligibleFrom(
      { user_id: "noshow", car_class: "LMGT3", created_at: "2026-11-11T17:00:00Z", division_id: "d6", waitlist: false },
      divs,
    )).toBeNull();
  });

  it("en reserve uden resultat endnu får ingen tiltrædelsespoint", () => {
    expect(joinerEligibleFrom(
      { user_id: "future", car_class: "LMGT3", created_at: "2026-11-11T17:00:00Z", division_id: "d6", waitlist: false },
      divs,
    )).toBeNull();
  });

  it("venteliste-tilmelding giver aldrig tiltrædelsespoint", () => {
    expect(joinerEligibleFrom(
      { user_id: "esben", car_class: "LMGT3", created_at: "2026-11-08T17:00:00Z", division_id: null, waitlist: true },
      divs,
    )).toBeNull();
  });

  it("almindelig sen tilmelding bruger tilmeldingstidspunktet", () => {
    expect(joinerEligibleFrom(
      { user_id: "late", car_class: "LMGT3", created_at: "2026-10-29T18:40:00Z", division_id: null, waitlist: false },
      divs,
    )).toBe(Date.parse("2026-10-29T18:40:00Z"));
  });

  it("bruger det tidligste tidspunkt når køreren har flere tilmeldinger", () => {
    const m = joinerEligibilityByKey([
      { user_id: "cato", car_class: "LMGT3", created_at: "2026-10-29T18:40:00Z", division_id: null, waitlist: false },
      { user_id: "cato", car_class: "LMGT3", created_at: "2026-11-07T10:00:00Z", division_id: "d6", waitlist: false },
    ], [{ ...r6, results: [{ user_id: "cato", car_class: "LMGT3", status: "classified" }] }]);
    expect(m.get("cato|LMGT3")).toBe(Date.parse("2026-10-29T18:40:00Z"));
  });
});
