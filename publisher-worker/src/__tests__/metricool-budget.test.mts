import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMetricoolMonthlyBudget } from "../worker";

test("counts one unit per target network", () => {
  const budget = evaluateMetricoolMonthlyBudget({ used: 5, networks: ["facebook", "instagram"] });
  assert.equal(budget.requestedUnits, 2);
  assert.equal(budget.projectedUsed, 7);
  assert.equal(budget.projectedRemaining, 13);
  assert.equal(budget.allowed, true);
});

test("deduplicates repeated networks", () => {
  const budget = evaluateMetricoolMonthlyBudget({ used: 5, networks: ["facebook", "facebook"] });
  assert.equal(budget.requestedUnits, 1);
});

test("allows the twentieth unit but blocks the twenty-first", () => {
  assert.equal(evaluateMetricoolMonthlyBudget({ used: 19, networks: ["instagram"] }).allowed, true);
  const blocked = evaluateMetricoolMonthlyBudget({ used: 19, networks: ["facebook", "instagram"] });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.projectedUsed, 21);
  assert.equal(blocked.remaining, 1);
});

test("blocks requests with no supported target network", () => {
  assert.equal(evaluateMetricoolMonthlyBudget({ used: 0, networks: [] }).allowed, false);
});
