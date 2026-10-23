import { describe, expect, it } from "vitest";
import { fromCents, toCents } from "../src/utils/money";

describe("money helpers", () => {
  it("converts rupee amounts to integer paise without floating point drift", () => {
    expect(toCents(12.35)).toBe(1235);
    expect(fromCents(1235)).toBe(12.35);
  });

  it("handles whole rupee values", () => {
    expect(toCents("5000.00")).toBe(500000);
    expect(fromCents(500000)).toBe(5000);
  });
});
