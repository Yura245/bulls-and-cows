import { describe, expect, it } from "vitest";

import { ensureDisplayName, ensureFourDigitsNoRepeats, normalizeRoomCode } from "../lib/validators";

describe("validators", () => {
  it("normalizes room code to upper case", () => {
    expect(normalizeRoomCode("ab12cd")).toBe("AB12CD");
  });

  it("validates 4 unique digits", () => {
    expect(ensureFourDigitsNoRepeats("4831", "INVALID_GUESS")).toBe("4831");
  });

  it("rejects repeated digits", () => {
    expect(() => ensureFourDigitsNoRepeats("1123", "INVALID_SECRET")).toThrowError();
  });

  it("rejects empty display name", () => {
    expect(() => ensureDisplayName("")).toThrowError();
  });
});
