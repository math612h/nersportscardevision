import { describe, it, expect } from "vitest";
import { totalAfterDrop } from "./standings-drop";

describe("drop-runde", () => {
  it("fratrækker den værste afdeling (DNS) med drop_rounds 1", () => {
    expect(totalAfterDrop({ a: 30, b: 0, c: 25 }, 1, 3)).toBe(55);
  });
  it("dropper ikke når der ikke er kørt flere afdelinger end drop-antallet", () => {
    expect(totalAfterDrop({ a: 30 }, 1, 1)).toBe(30);
  });
});
