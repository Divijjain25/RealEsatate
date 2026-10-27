import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { istDayRange, parseIstLocal, toIstLocalInput } from "../../src/lib/dates.ts";
import { formatBudget, formatRupees, parseRupees } from "../../src/lib/money.ts";
import { formatPhone, normalizePhone } from "../../src/lib/phone.ts";

describe("normalizePhone", () => {
  const valid: Array<[string, string]> = [
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["(+91) 9876543210", "+919876543210"],
    ["0091 9876543210", "+919876543210"],
    ["+971 50 123 4567", "+971501234567"],
  ];
  for (const [input, expected] of valid) {
    it(`accepts ${input}`, () => assert.equal(normalizePhone(input), expected));
  }

  for (const input of ["", "12345", "5876543210", "+91 12345 67890", "abcdefghij", "98765432101234567"]) {
    it(`rejects "${input}"`, () => assert.equal(normalizePhone(input), null));
  }

  it("formats Indian numbers for display", () => {
    assert.equal(formatPhone("+919876543210"), "+91 98765 43210");
    assert.equal(formatPhone("+971501234567"), "+971501234567");
  });
});

describe("parseRupees", () => {
  const cases: Array<[string, number | undefined | null]> = [
    ["", undefined],
    ["   ", undefined],
    ["80L", 8_000_000],
    ["80 lakh", 8_000_000],
    ["1.2 Cr", 12_000_000],
    ["1.25cr", 12_500_000],
    ["₹ 75,00,000", 7_500_000],
    ["Rs. 45000", 45_000],
    ["45k", 45_000],
    ["8500000", 8_500_000],
    ["eighty lakh", null],
    ["1.2.3L", null],
  ];
  for (const [input, expected] of cases) {
    it(`parses "${input}"`, () => assert.equal(parseRupees(input), expected));
  }

  it("formats rupees the Indian way", () => {
    assert.equal(formatRupees(8_500_000), "₹85 L");
    assert.equal(formatRupees(12_000_000), "₹1.2 Cr");
    assert.equal(formatRupees(45_000), "₹45,000");
    assert.equal(formatRupees(null), "—");
    assert.equal(formatBudget(6_000_000, 8_000_000), "₹60 L – ₹80 L");
    assert.equal(formatBudget(null, 8_000_000), "up to ₹80 L");
    assert.equal(formatBudget(null, null), "—");
  });
});

describe("IST dates", () => {
  it("reads datetime-local input as IST", () => {
    assert.equal(parseIstLocal("2026-10-27T15:30")?.toISOString(), "2026-10-27T10:00:00.000Z");
    assert.equal(parseIstLocal("not a date"), null);
  });

  it("round-trips to a datetime-local value", () => {
    assert.equal(toIstLocalInput("2026-10-27T10:00:00.000Z"), "2026-10-27T15:30");
    assert.equal(toIstLocalInput(null), "");
  });

  it("finds the IST day around a UTC instant", () => {
    // 20:00 UTC on 26 Oct is already 01:30 on 27 Oct in India.
    const { start, end } = istDayRange(new Date("2026-10-26T20:00:00Z"));
    assert.equal(start.toISOString(), "2026-10-26T18:30:00.000Z");
    assert.equal(end.toISOString(), "2026-10-27T18:30:00.000Z");
  });
});
