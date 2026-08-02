import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { computeStints, expandDriverStints, msToLapStr, type ParsedDriver } from "../lmu-parser";
import { parseLmuRaceFileServer } from "../lmu-parser-server";

const baseDriver = (over: Partial<ParsedDriver> = {}): ParsedDriver => ({
  name: "Per Arildsoe",
  carClass: "GT3",
  carClassNorm: "LMGT3",
  carModel: "BMW M4 LMGT3",
  bestLapMs: 82662,
  finishMs: null,
  finished: true,
  position: 1,
  classPosition: 1,
  laps: 169,
  stints: null,
  ...over,
});

const lap = (num: number, value: string) => ({ num, value });

describe("computeStints", () => {
  it("1) almindeligt løb uden swaps → ingen stints", () => {
    expect(computeStints([lap(1, "83.5"), lap(2, "82.9")], [])).toBeNull();
  });

  it("2) to kørere i samme bil", () => {
    const stints = computeStints(
      [lap(1, "95.8197"), lap(8, "82.6622"), lap(91, "84.0"), lap(92, "84.9"), lap(103, "83.5342")],
      [
        { startLap: 1, endLap: 91, name: "Mathias Hestehave" },
        { startLap: 92, endLap: 169, name: "Per Arildsoe" },
      ],
    )!;
    expect(stints).toEqual([
      { name: "Mathias Hestehave", bestLapMs: 82662, bestLapNum: 8, validLaps: 3 },
      { name: "Per Arildsoe", bestLapMs: 83534, bestLapNum: 103, validLaps: 2 },
    ]);
  });

  it("3) tre kørere i samme bil", () => {
    const stints = computeStints(
      [lap(1, "90"), lap(20, "88"), lap(45, "87.5"), lap(80, "86.25")],
      [
        { startLap: 1, endLap: 30, name: "A" },
        { startLap: 31, endLap: 60, name: "B" },
        { startLap: 61, endLap: 100, name: "C" },
      ],
    )!;
    expect(stints.map((s) => [s.name, s.bestLapMs])).toEqual([["A", 88000], ["B", 87500], ["C", 86250]]);
  });

  it("4) samme kører i flere stints → hurtigste samlet", () => {
    const stints = computeStints(
      [lap(5, "90"), lap(50, "89"), lap(100, "85.5")],
      [
        { startLap: 1, endLap: 40, name: "A" },
        { startLap: 41, endLap: 80, name: "B" },
        { startLap: 81, endLap: 120, name: "A" },
      ],
    )!;
    expect(stints.find((s) => s.name === "A")).toEqual({ name: "A", bestLapMs: 85500, bestLapNum: 100, validLaps: 2 });
  });

  it("5) ugyldige omgangstider ignoreres", () => {
    const stints = computeStints(
      [lap(1, "--.----"), lap(2, ""), lap(3, "abc"), lap(4, "-5"), lap(5, "84.5")],
      [{ startLap: 1, endLap: 10, name: "A" }],
    )!;
    expect(stints).toEqual([{ name: "A", bestLapMs: 84500, bestLapNum: 5, validLaps: 1 }]);
  });

  it("6) ugyldige swap-intervaller frasorteres, og ufordelte omgange tilskrives ingen", () => {
    expect(computeStints([lap(1, "84")], [{ startLap: null, endLap: 10, name: "A" }])).toBeNull();
    const stints = computeStints(
      [lap(1, "84"), lap(50, "80")],
      [{ startLap: 1, endLap: 10, name: "A" }],
    )!;
    expect(stints).toEqual([{ name: "A", bestLapMs: 84000, bestLapNum: 1, validLaps: 1 }]);
  });

  it("7) ukendt kører giver egen post — ikke tilskrevet det overordnede Name", () => {
    const rows = expandDriverStints([
      baseDriver({ stints: [{ name: "Ukendt Gæst", bestLapMs: 81000, bestLapNum: 4, validLaps: 9 }] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ukendt Gæst");
    expect(rows[0].bestLapMs).toBe(81000);
  });

  it("uden stints bevares kørerens egen tid", () => {
    const rows = expandDriverStints([baseDriver()]);
    expect(rows[0].name).toBe("Per Arildsoe");
    expect(rows[0].bestLapMs).toBe(82662);
  });
});

const FIXTURE = "/mnt/user-uploads/2026_08_02_00_27_19-13R1-1.xml";

describe.skipIf(!existsSync(FIXTURE))("8) regression: Laguna Seca endurance-fil", () => {
  it("Team Bundgas B fordeles korrekt mellem Mathias og Per", () => {
    const parsed = parseLmuRaceFileServer(readFileSync(FIXTURE, "utf8"));
    const car = parsed.drivers.find((d) => d.name === "Per Arildsoe")!;
    expect(car.stints).not.toBeNull();
    const rows = expandDriverStints([car]);
    const mathias = rows.find((r) => r.name === "Mathias Hestehave")!;
    const per = rows.find((r) => r.name === "Per Arildsoe")!;
    expect(mathias.bestLapMs).toBe(82662);
    expect(msToLapStr(mathias.bestLapMs!)).toBe("1:22.662");
    expect(car.stints!.find((s) => s.name === "Mathias Hestehave")!.bestLapNum).toBe(8);
    expect(per.bestLapMs).toBe(83534);
    expect(msToLapStr(per.bestLapMs!)).toBe("1:23.534");
    expect(car.stints!.find((s) => s.name === "Per Arildsoe")!.bestLapNum).toBe(103);
  });

  it("almindelige kørere uden swaps beholder deres BestLapTime", () => {
    const parsed = parseLmuRaceFileServer(readFileSync(FIXTURE, "utf8"));
    const solo = parsed.drivers.filter((d) => !d.stints || d.stints.length === 0);
    for (const d of solo) {
      expect(expandDriverStints([d])).toEqual([d]);
    }
  });
});
