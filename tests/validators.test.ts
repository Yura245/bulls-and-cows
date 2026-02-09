import { describe, expect, it } from "vitest";

import { ensureChatMessage, ensureDisplayName, ensureFourDigitsNoRepeats, ensureTurnSeconds, normalizeRoomCode } from "../lib/validators";

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

  it("accepts valid timer values", () => {
    expect(ensureTurnSeconds(0)).toBe(0);
    expect(ensureTurnSeconds(30)).toBe(30);
  });

  it("rejects invalid timer value", () => {
    expect(() => ensureTurnSeconds(20)).toThrowError();
  });

  it("validates chat message", () => {
    expect(ensureChatMessage("привет")).toBe("привет");
  });

  it("rejects empty chat message", () => {
    expect(() => ensureChatMessage("   ")).toThrowError();
  });
});
