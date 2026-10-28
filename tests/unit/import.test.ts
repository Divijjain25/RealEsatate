import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  guessMapping,
  normalizeBhk,
  normalizeSource,
  normalizeStatus,
  normalizeTemperature,
  parseBudgetRange,
  parseCsv,
  parseFollowUpDate,
  prepareImport,
  toCsv,
  validateImportRecord,
  type ImportDefaults,
} from "../../src/lib/leads/import.ts";

const defaults: ImportDefaults = { source: "other", temperature: "warm", assignedTo: null };

describe("parseCsv", () => {
  it("handles quotes, commas, newlines, CRLF and BOM", () => {
    const text = '﻿Name,Mobile,Notes\r\n"Sharma, Rahul",98765 43210,"Wants ""corner"" flat\nnear metro"\r\nAnita,9123456780,\r\n\r\n';
    assert.deepEqual(parseCsv(text), [
      ["Name", "Mobile", "Notes"],
      ["Sharma, Rahul", "98765 43210", 'Wants "corner" flat\nnear metro'],
      ["Anita", "9123456780", ""],
    ]);
  });

  it("detects semicolon and tab separated files", () => {
    assert.deepEqual(parseCsv("Name;Phone\nA;9876543210"), [["Name", "Phone"], ["A", "9876543210"]]);
    assert.deepEqual(parseCsv("Name\tPhone\nA\t9876543210"), [["Name", "Phone"], ["A", "9876543210"]]);
  });

  it("drops blank rows", () => {
    assert.equal(parseCsv("Name,Phone\n,,\nA,1\n").length, 2);
  });
});

describe("guessMapping", () => {
  it("recognises common spreadsheet headers", () => {
    const m = guessMapping(["Customer Name", "Mobile No", "Alternate Mobile", "Email ID", "Budget", "Area", "Configuration", "Lead Source", "Remarks", "Next Follow Up"]);
    assert.equal(m.name, 0);
    assert.equal(m.phone, 1);
    assert.equal(m.altPhone, 2);
    assert.equal(m.email, 3);
    assert.equal(m.budget, 4);
    assert.equal(m.locations, 5);
    assert.equal(m.bhk, 6);
    assert.equal(m.source, 7);
    assert.equal(m.notes, 8);
    assert.equal(m.nextFollowUp, 9);
    assert.equal(m.status, null);
  });
});

describe("value normalisers", () => {
  it("parses budget ranges", () => {
    assert.deepEqual(parseBudgetRange("60-80L"), { min: 6_000_000, max: 8_000_000 });
    assert.deepEqual(parseBudgetRange("60L - 80L"), { min: 6_000_000, max: 8_000_000 });
    assert.deepEqual(parseBudgetRange("60 to 80 lakh"), { min: 6_000_000, max: 8_000_000 });
    assert.deepEqual(parseBudgetRange("1-1.5 Cr"), { min: 10_000_000, max: 15_000_000 });
    assert.deepEqual(parseBudgetRange("80L"), { min: null, max: 8_000_000 });
    assert.deepEqual(parseBudgetRange(""), { min: null, max: null });
    assert.equal(parseBudgetRange("90-60L"), null);
    assert.equal(parseBudgetRange("around eighty"), null);
  });

  it("normalises BHK text", () => {
    assert.deepEqual(normalizeBhk("2 BHK"), ["2BHK"]);
    assert.deepEqual(normalizeBhk("2,3 bhk"), ["2BHK", "3BHK"]);
    assert.deepEqual(normalizeBhk("1RK / 1BHK"), ["1RK", "1BHK"]);
    assert.deepEqual(normalizeBhk("2.5 BHK"), ["2BHK"]);
    assert.deepEqual(normalizeBhk("6 bhk villa"), ["5+BHK"]);
    assert.deepEqual(normalizeBhk(""), []);
  });

  it("maps sources, temperature and status words", () => {
    assert.equal(normalizeSource("99 Acres"), "99acres");
    assert.equal(normalizeSource("Magic Bricks"), "magicbricks");
    assert.equal(normalizeSource("Housing.com"), "housing");
    assert.equal(normalizeSource("FB"), "facebook");
    assert.equal(normalizeSource("Walk in"), "walk_in");
    assert.equal(normalizeSource("Newspaper"), "other");
    assert.equal(normalizeSource(""), null);
    assert.equal(normalizeTemperature("HOT"), "hot");
    assert.equal(normalizeTemperature("low"), "cold");
    assert.equal(normalizeTemperature("?"), null);
    assert.equal(normalizeStatus("Site Visit Done"), "site_visit_done");
    assert.equal(normalizeStatus("Not Interested"), "lost");
    assert.equal(normalizeStatus("Interested"), "qualified");
    assert.equal(normalizeStatus("Booked"), "won");
    assert.equal(normalizeStatus("whatever"), "new");
  });

  it("reads day-first dates in IST", () => {
    assert.equal(parseFollowUpDate("28/10/2026"), "2026-10-28T04:30:00.000Z");
    assert.equal(parseFollowUpDate("28-10-2026 2:30 pm"), "2026-10-28T09:00:00.000Z");
    assert.equal(parseFollowUpDate("2026-10-28 14:30"), "2026-10-28T09:00:00.000Z");
    assert.equal(parseFollowUpDate("28/10/26"), "2026-10-28T04:30:00.000Z");
    assert.equal(parseFollowUpDate(""), undefined);
    assert.equal(parseFollowUpDate("10/28/2026"), null);
    assert.equal(parseFollowUpDate("31/02/2026"), null);
    assert.equal(parseFollowUpDate("next week"), null);
  });
});

describe("validateImportRecord / prepareImport", () => {
  it("builds lead values and applies defaults", () => {
    const result = validateImportRecord(
      { name: "Rahul", phone: "098765-43210", budget: "60-80L", locations: "Wakad; Baner", bhk: "2 BHK", source: "" },
      { source: "99acres", temperature: "hot", assignedTo: "abc" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.values.phone_e164, "+919876543210");
    assert.equal(result.values.budget_min, 6_000_000);
    assert.deepEqual(result.values.locations, ["Wakad", "Baner"]);
    assert.equal(result.values.source, "99acres");
    assert.equal(result.values.temperature, "hot");
    assert.equal(result.values.assigned_to, "abc");
    assert.equal(result.values.status, "new");
  });

  it("explains why a row is rejected", () => {
    const bad = (record: Record<string, string>) => {
      const r = validateImportRecord(record, defaults);
      return r.ok ? "" : r.error;
    };
    assert.match(bad({ name: "", phone: "9876543210" }), /Name is empty/);
    assert.match(bad({ name: "A", phone: "" }), /Mobile number is empty/);
    assert.match(bad({ name: "A", phone: "12345" }), /not a valid mobile/);
    assert.match(bad({ name: "A", phone: "9876543210", budget: "lots" }), /Budget/);
    assert.match(bad({ name: "A", phone: "9876543210", email: "x@" }), /email/);
    assert.match(bad({ name: "A", phone: "9876543210", nextFollowUp: "soon" }), /DD\/MM\/YYYY/);
  });

  it("flags rows with a number already used earlier in the file", () => {
    const table = [
      ["Name", "Phone"],
      ["A", "9876543210"],
      ["B", "bad"],
      ["C", "+91 98765 43210"],
      ["D", "9123456780"],
    ];
    const rows = prepareImport(table, guessMapping(table[0]), defaults);
    assert.deepEqual(rows.map((r) => [r.line, r.kind]), [
      [2, "ok"],
      [3, "invalid"],
      [4, "duplicate_in_file"],
      [5, "ok"],
    ]);
  });

  it("writes a CSV that Excel can reopen", () => {
    assert.equal(toCsv([["Row", "Reason"], ["3", 'Bad "phone", sorry']]), 'Row,Reason\r\n3,"Bad ""phone"", sorry"');
  });
});
