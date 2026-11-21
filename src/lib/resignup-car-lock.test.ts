import { describe, expect, it } from "vitest";
import { resignupLockedCar } from "./resignup-car-lock";

const now = new Date("2026-11-21T12:00:00Z").getTime();
const locked = { car_lock_never: false, car_lock_at: "2026-10-01T00:00:00Z" };
const brian = [
  { car_class: "LMGT3", car_model: "BMW M4 LMGT3", car_number: 107, withdrawn_at: "2026-11-16T18:55:00Z", division_id: null },
];

describe("resignupLockedCar", () => {
  it("låser til den tidligere bil ved genindmelding i samme klasse", () => {
    expect(resignupLockedCar(brian, "LMGT3", locked, now)).toEqual({ carModel: "BMW M4 LMGT3", carNumber: 107 });
  });

  it("giver frit bilvalg i en anden klasse", () => {
    expect(resignupLockedCar(brian, "LMP2", locked, now)).toBeNull();
  });

  it("giver frit bilvalg før ligaens bil-lås", () => {
    expect(resignupLockedCar(brian, "LMGT3", { car_lock_at: "2026-12-01T00:00:00Z" }, now)).toBeNull();
  });

  it("giver frit bilvalg når ligaen aldrig låser biler", () => {
    expect(resignupLockedCar(brian, "LMGT3", { car_lock_never: true, car_lock_at: locked.car_lock_at }, now)).toBeNull();
  });

  it("bruger den senest udmeldte tilmelding", () => {
    const prev = [
      ...brian,
      { car_class: "LMGT3", car_model: "Ferrari 296 LMGT3", car_number: 7, withdrawn_at: "2026-10-05T10:00:00Z", division_id: null },
    ];
    expect(resignupLockedCar(prev, "LMGT3", locked, now)?.carModel).toBe("BMW M4 LMGT3");
  });
});
