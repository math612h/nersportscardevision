import { describe, it, expect } from "vitest";
import { countDnsSinceSignup, type DnsDivision } from "./dns-count";

const dns = (user_id: string) => ({ user_id, car_class: "GT3", status: "dns" });
const div = (iso: string, rows: any[], confirmed = true): DnsDivision => ({
  confirmed, raceTs: Date.parse(iso), results: rows,
});

const season = [
  div("2026-09-02T18:00:00Z", [dns("u1")]),
  div("2026-09-16T18:00:00Z", [dns("u1")]),
  div("2026-10-14T18:00:00Z", [dns("u1")]),
];

describe("DNS-grænsen tæller fra tilmeldingstidspunktet", () => {
  it("tæller alle DNS for en kører tilmeldt fra sæsonstart", () => {
    expect(countDnsSinceSignup("u1", "GT3", "2026-08-01T00:00:00Z", season)).toBe(3);
  });

  it("genindmeldt kører starter på 0 DNS", () => {
    expect(countDnsSinceSignup("u1", "GT3", "2026-09-20T00:00:00Z", season.slice(0, 2))).toBe(0);
  });

  it("tæller kun DNS i afdelinger efter genindmeldelsen", () => {
    expect(countDnsSinceSignup("u1", "GT3", "2026-09-20T00:00:00Z", season)).toBe(1);
  });

  it("ubekræftede resultater tæller ikke", () => {
    const d = [div("2026-10-14T18:00:00Z", [dns("u1")], false)];
    expect(countDnsSinceSignup("u1", "GT3", "2026-08-01T00:00:00Z", d)).toBe(0);
  });
});
