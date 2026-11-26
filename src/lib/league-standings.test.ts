import { describe, expect, it } from "vitest";
import { aggregateStandings, driverDuel } from "./league-standings";

const res = (user_id: string, name: string, num: number, points: number) => ({
  user_id, driver_name: name, car_number: num, car_class: "GT3", driver_category: "Pro", class_position: 1, points,
});
const div = (id: string, results: any[]) => ({ id, settings: { completed: true, results } });

describe("driverDuel", () => {
  const rows = aggregateStandings(
    [div("d1", [res("a", "Anna", 1, 25), res("b", "Bo", 2, 18), res("c", "Carl", 3, 15)]), div("d2", [res("a", "Anna", 1, 10), res("b", "Bo", 2, 25), res("c", "Carl", 3, 12)])],
    [],
    0,
  );

  it("viser køreren foran og bagved med pointforskel", () => {
    // Bo 43, Anna 35, Carl 27
    const d = driverDuel(rows, "a")!;
    expect(d.position).toBe(2);
    expect(d.total).toBe(35);
    expect(d.ahead).toEqual({ name: "Bo", carNumber: 2, gap: 8 });
    expect(d.behind).toEqual({ name: "Carl", carNumber: 3, gap: 8 });
  });

  it("lederen har ingen foran, sidstepladsen ingen bagved", () => {
    expect(driverDuel(rows, "b")!.ahead).toBeNull();
    expect(driverDuel(rows, "c")!.behind).toBeNull();
  });

  it("returnerer null for kørere uden resultater", () => {
    expect(driverDuel(rows, "x")).toBeNull();
  });
});

import { aggregateStandings as agg2 } from "./league-standings";
describe("strafpoint og drop-runde", () => {
  it("trækker strafpoint fra selv ved 0 løbspoint i en droppet afdeling", () => {
    const mk = (id: string, points: number, pen: number) => ({ id, settings: { results: [
      { user_id: "u1", car_number: 110, driver_name: "D", car_class: "GT3", driver_category: "Am", class_position: 1, points, penalty_points: pen },
    ] } });
    const [r] = agg2([mk("a", 50, 0), mk("b", 0, 4), mk("c", 40, 0)], [], 1);
    expect(r!.total).toBe(86);
    expect(r!.pointPenalty).toBe(4);
  });
});
