import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseLeadForm, rawLeadFields } from "../../src/lib/leads/schema.ts";

function form(overrides: Record<string, string | string[]> = {}) {
  const base: Record<string, string | string[]> = {
    name: "Rahul Sharma",
    phone: "98765 43210",
    altPhone: "",
    email: "",
    purpose: "buy",
    budgetMin: "60L",
    budgetMax: "80 lakh",
    locations: "Wakad, Baner, wakad , ",
    bhk: ["2BHK", "3BHK"],
    propertyType: "apartment",
    source: "99acres",
    status: "new",
    temperature: "hot",
    assignedTo: "",
    nextFollowUp: "2026-10-28T11:00",
    notes: "",
    lostReason: "",
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(base)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

describe("parseLeadForm", () => {
  it("normalises a typical lead", () => {
    const result = parseLeadForm(form());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.values.phone_e164, "+919876543210");
    assert.equal(result.values.budget_min, 6_000_000);
    assert.equal(result.values.budget_max, 8_000_000);
    assert.deepEqual(result.values.locations, ["Wakad", "Baner", "wakad"]);
    assert.deepEqual(result.values.bhk, ["2BHK", "3BHK"]);
    assert.equal(result.values.next_follow_up_at, "2026-10-28T05:30:00.000Z");
    assert.equal(result.values.assigned_to, null);
    assert.equal(result.values.email, null);
  });

  it("rejects bad input with a readable message", () => {
    const cases: Array<[Record<string, string | string[]>, RegExp]> = [
      [{ name: "  " }, /Name is required/],
      [{ phone: "" }, /Phone is required/],
      [{ phone: "12345" }, /valid mobile/],
      [{ budgetMin: "lots" }, /80L/],
      [{ budgetMin: "1 Cr", budgetMax: "50L" }, /less than or equal/],
      [{ email: "not-an-email" }, /Email/],
      [{ status: "sold" }, /./],
      [{ bhk: ["9BHK"] }, /./],
      [{ nextFollowUp: "tomorrow" }, /follow-up/],
    ];
    for (const [overrides, pattern] of cases) {
      const result = parseLeadForm(form(overrides));
      assert.equal(result.ok, false, JSON.stringify(overrides));
      if (!result.ok) assert.match(result.error, pattern);
    }
  });

  it("keeps raw values to refill the form", () => {
    const fields = rawLeadFields(form({ budgetMin: "lots" }));
    assert.equal(fields.budgetMin, "lots");
    assert.equal(fields.bhk, "2BHK,3BHK");
  });
});
