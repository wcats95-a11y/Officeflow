import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRemedyDeadline,
  getRemedyDeadlineRule,
  isReturnOrTaxAuditMatter,
} from "../lib/income-tax-deadlines.ts";

test("first appeal and cross-objection deadlines are 30 days from their trigger date", () => {
  assert.equal(calculateRemedyDeadline("first-appeal", "2026-11-05"), "2026-12-05");
  assert.equal(calculateRemedyDeadline("cross-objection", "2026-11-05"), "2026-12-05");
});

test("ITAT appeal deadline is two calendar months from the communicated month-end", () => {
  assert.equal(calculateRemedyDeadline("itat-appeal", "2026-11-05"), "2027-01-31");
});

test("ITAT rectification deadline is six calendar months from the order month-end", () => {
  assert.equal(calculateRemedyDeadline("itat-rectification", "2026-11-05"), "2027-05-31");
});

test("remedy classification excludes hearing and order-received tasks", () => {
  assert.equal(getRemedyDeadlineRule({ matterType: "Appeal", taskType: "CIT(A) hearing notice" }), null);
  assert.equal(getRemedyDeadlineRule({ matterType: "ITAT appeal", taskType: "ITAT order received" }), null);
  assert.equal(getRemedyDeadlineRule({ matterType: "ITAT appeal", taskType: "ITAT appeal filing" }), "itat-appeal");
  assert.equal(getRemedyDeadlineRule({ matterType: "ITAT appeal", taskType: "Cross-objection filing" }), "cross-objection");
  assert.equal(getRemedyDeadlineRule({ matterType: "Rectification", taskType: "ITAT rectification application u/s 254(2)" }), "itat-rectification");
  assert.equal(getRemedyDeadlineRule({ matterType: "Rectification", taskType: "ITAT rectification application" }), "itat-rectification");
});

test("return and tax audit are the only matter types requiring a manually entered statutory due date", () => {
  assert.equal(isReturnOrTaxAuditMatter("ITR filing"), true);
  assert.equal(isReturnOrTaxAuditMatter("Tax audit"), true);
  assert.equal(isReturnOrTaxAuditMatter("Assessment"), false);
  assert.equal(isReturnOrTaxAuditMatter("Appeal"), false);
});

test("deadline calculation rejects invalid and impossible ISO dates", () => {
  assert.equal(calculateRemedyDeadline("first-appeal", "2026-02-30"), "");
  assert.equal(calculateRemedyDeadline("itat-appeal", "not-a-date"), "");
});
