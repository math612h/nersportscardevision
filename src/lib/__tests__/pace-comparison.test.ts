import { describe, it, expect } from "vitest";
import { buildPaceComparison, medianOf, gapToStr, type PaceFile } from "../pace-comparison";
import type { ParsedDriver, ParsedRace } from "../lmu-parser";

const driver = (over: Partial<ParsedDriver> & { name: string }): ParsedDriver => ({
  carClass: "GT3",
  carClassNorm: "LMGT3",
  carModel: "BMW M4 LMGT3",
  bestLapMs: null,
  finishMs: null,
  finished: true,
  position: null,
  classPosition: null,
  laps: null,
  carNumber: "36",
  validLaps: [],
  swaps: null,
  stints: null,
  ...over,
});

const race = (drivers: ParsedDriver[]): ParsedRace => ({
  track: "Laguna Seca",
  layout: null,
  recordedAt: null,
  gameVersion: "1.0",
  drivers,
});

const laps = (ms: number[]) => ms.map((m, i) => ({ num: i + 1, ms: m }));

const file = (source: "pro" | "am", drivers: ParsedDriver[]): PaceFile => ({
  source,
  fileName: `${source}.xml`,
  race: race(drivers),
});

describe("medianOf", () => {
  it("bruger gennemsnittet af 5. og 6. ved 10 tider", () => {
    expect(medianOf([1, 2, 3, 4, 10, 20, 30, 40, 50, 60])).toBe(15);
  });
});

describe("buildPaceComparison", () => {
  it("ignorerer LMP2 og samler LMGT3 fra begge filer sorteret på median", () => {
    const rows = buildPaceComparison([
      file("pro", [
        driver({ name: "Pro Fast", validLaps: laps([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]) }),
        driver({ name: "LMP2 Guy", carClass: "LMP2", carClassNorm: "LMP2", validLaps: laps(new Array(12).fill(90)) }),
      ]),
      file("am", [
        driver({ name: "Am Slow", carNumber: "77", validLaps: laps([200, 201, 202, 203, 204, 205, 206, 207, 208, 209]) }),
      ]),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Pro Fast", "Am Slow"]);
    expect(rows[0].medianMs).toBe(104.5);
    expect(rows[0].position).toBe(1);
    expect(rows[0].gapMs).toBe(0);
    expect(rows[1].source).toBe("am");
    expect(rows[1].gapMs).toBe(100);
  });

  it("frasorterer ugyldige omgange og markerer utilstrækkeligt datagrundlag nederst", () => {
    const rows = buildPaceComparison([
      file("pro", [
        driver({ name: "Few", validLaps: laps([100, 101, 102]) }),
        driver({ name: "Enough", validLaps: laps(new Array(11).fill(0).map((_, i) => 150 + i)) }),
      ]),
    ]);
    expect(rows[0].name).toBe("Enough");
    expect(rows[1].name).toBe("Few");
    expect(rows[1].insufficient).toBe(true);
    expect(rows[1].medianMs).toBeNull();
    expect(rows[1].position).toBeNull();
  });

  it("fordeler omgange pr. kører ved førerskift", () => {
    const rows = buildPaceComparison([
      file("pro", [
        driver({
          name: "Bil A",
          validLaps: [...laps([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]), ...Array.from({ length: 10 }, (_, i) => ({ num: 11 + i, ms: 200 + i }))],
          swaps: [
            { startLap: 1, endLap: 10, name: "Kører 1" },
            { startLap: 11, endLap: 20, name: "Kører 2" },
          ],
        }),
      ]),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Kører 1", "Kører 2"]);
    expect(rows[0].validLapCount).toBe(10);
    expect(rows[1].validLapCount).toBe(10);
  });
});

describe("gapToStr", () => {
  it("viser forskellen med fortegn og 3 decimaler", () => {
    expect(gapToStr(638)).toBe("+0.638");
  });
});
