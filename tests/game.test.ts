import { describe, expect, it } from "vitest";

import { computeBullsAndCows, flipSeat } from "../lib/game";

describe("computeBullsAndCows", () => {
  it("counts bulls and cows for partial match", () => {
    expect(computeBullsAndCows("4271", "1234")).toEqual({
      bulls: 1,
      cows: 2
    });
  });

  it("returns win on exact match", () => {
    expect(computeBullsAndCows("9150", "9150")).toEqual({
      bulls: 4,
      cows: 0
    });
  });

  it("returns zero when no digits match", () => {
    expect(computeBullsAndCows("1234", "5678")).toEqual({
      bulls: 0,
      cows: 0
    });
  });
});

describe("flipSeat", () => {
  it("switches seat 1 -> 2", () => {
    expect(flipSeat(1)).toBe(2);
  });

  it("switches seat 2 -> 1", () => {
    expect(flipSeat(2)).toBe(1);
  });
});
