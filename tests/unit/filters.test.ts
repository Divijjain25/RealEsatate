import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { leadsHref, parseLeadFilters, searchKind } from "../../src/lib/leads/filters.ts";

describe("parseLeadFilters", () => {
  it("uses safe defaults for an empty URL", () => {
    assert.deepEqual(parseLeadFilters({}), {
      q: "",
      status: null,
      temperature: null,
      source: null,
      assigned: null,
      followUp: null,
      sort: "follow_up",
      page: 1,
    });
  });

  it("keeps valid values and drops unknown ones", () => {
    const f = parseLeadFilters({
      status: "negotiation",
      temperature: "boiling",
      source: "99acres",
      assigned: "not-a-uuid",
      followUp: "overdue",
      sort: "budget",
      page: "3",
    });
    assert.equal(f.status, "negotiation");
    assert.equal(f.temperature, null);
    assert.equal(f.source, "99acres");
    assert.equal(f.assigned, null);
    assert.equal(f.followUp, "overdue");
    assert.equal(f.sort, "budget");
    assert.equal(f.page, 3);
  });

  it("accepts me / unassigned / uuid for assigned", () => {
    assert.equal(parseLeadFilters({ assigned: "me" }).assigned, "me");
    assert.equal(parseLeadFilters({ assigned: "unassigned" }).assigned, "unassigned");
    const id = "10000000-0000-0000-0000-0000000000a1";
    assert.equal(parseLeadFilters({ assigned: id }).assigned, id);
  });

  it("neutralises search pattern characters", () => {
    assert.equal(parseLeadFilters({ q: "  Rahul%_,(x) " }).q, "Rahul x");
    assert.equal(parseLeadFilters({ page: "-4" }).page, 1);
    assert.equal(parseLeadFilters({ status: ["active", "won"] }).status, "active");
  });
});

describe("leadsHref", () => {
  it("omits defaults", () => {
    assert.equal(leadsHref({}), "/leads");
    assert.equal(leadsHref({ sort: "follow_up", page: 1 }), "/leads");
    assert.equal(leadsHref({ status: "active", temperature: "hot", page: 2 }), "/leads?status=active&temperature=hot&page=2");
  });
});

describe("searchKind", () => {
  it("detects phone vs name searches", () => {
    assert.deepEqual(searchKind("98765"), { field: "phone", digits: "98765" });
    assert.deepEqual(searchKind("+91 98765"), { field: "phone", digits: "9198765" });
    assert.deepEqual(searchKind("Rahul"), { field: "name", text: "Rahul" });
    assert.deepEqual(searchKind("Flat 12"), { field: "name", text: "Flat 12" });
    assert.equal(searchKind(""), null);
  });
});
