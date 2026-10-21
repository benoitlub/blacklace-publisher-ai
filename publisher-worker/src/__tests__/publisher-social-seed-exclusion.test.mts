import test from "node:test";
import assert from "node:assert/strict";
import { isHarvestAllowedForSocialSelection } from "../worker";

const rows = [
  { id: "420-old", seed_id: "420-dice" },
  { id: "420-new", seed_id: "420-dice" },
  { id: "feuch-1", seed_id: "feuch-dice" },
  { id: "terra-1", seed_id: "terra" },
];

test("excluding a seed excludes ALL its harvests, including new IDs", () => {
  const eligible = rows.filter(row => isHarvestAllowedForSocialSelection(
    row, new Set<string>(), new Set(["420-dice"]),
  ));
  assert.deepEqual(eligible.map(row => row.id), ["feuch-1", "terra-1"]);
});

test("excluding one harvest does not exclude its entire seed", () => {
  const eligible = rows.filter(row => isHarvestAllowedForSocialSelection(
    row, new Set(["420-old"]), new Set<string>(),
  ));
  assert.deepEqual(eligible.map(row => row.id), ["420-new", "feuch-1", "terra-1"]);
});

test("seed and harvest exclusions combine independently", () => {
  const eligible = rows.filter(row => isHarvestAllowedForSocialSelection(
    row, new Set(["feuch-1"]), new Set(["420-dice"]),
  ));
  assert.deepEqual(eligible.map(row => row.id), ["terra-1"]);
});

test("without exclusions, every harvest stays eligible at this stage", () => {
  assert.deepEqual(
    rows.filter(row => isHarvestAllowedForSocialSelection(row, new Set(), new Set())),
    rows,
  );
});
