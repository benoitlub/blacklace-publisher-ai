import { test } from "node:test";
import assert from "node:assert/strict";
import { isVerifiedYaebaliSource } from "../knowledge/knowledge-package-resolver.ts";

const item = (title: string, content: string, universe = "", tags: string[] = []) =>
  ({ id: title, title, content, universe, tags, isMock: false });

test("client briefing about mortgage/real-estate prospecting is valid", () => {
  assert.equal(isVerifiedYaebaliSource(item(
    "Yael Bali — Préqualification de prospects immobiliers",
    "Courtière en immobilier, accompagnement pour préparer un achat et un financement immobilier.",
    "yael-prequalification-de-prospects",
  )), true);
});

test("a 420 Dice Reel cannot impersonate a Yaebali Notion source even with forged tags and universe", () => {
  assert.equal(isVerifiedYaebaliSource(item(
    "Publisher · Reel 420 Dice Game — Pas de 420, gage",
    "Campagne Instagram pour 420 Dice. Yaelbali suivra les prospects immobiliers dans Notion.",
    "yael-prequalification-de-prospects",
    ["yaelbali","yael-prequalification-de-prospects"],
  )), false);
});

test("generic business lead guidance is insufficient evidence of a real estate customer brief", () => {
  assert.equal(isVerifiedYaebaliSource(item(
    "Business growth — Préqualification",
    "Grille de scoring pour consultants, indépendants, prospects chauds/tièdes.",
  )), false);
});

test("different-customer real estate content is not Yaebali identity", () => {
  assert.equal(isVerifiedYaebaliSource(item(
    "Courtage immobilier de Simone",
    "Conseils sur le financement d'un achat immobilier.", "simone-courtage",
  )), false);
});

test("a simulated source never counts as verified", () => {
  const fake = item("Yael Bali", "Courtage immobilier", "yael-prequalification-de-prospects");
  assert.equal(isVerifiedYaebaliSource({ ...fake, isMock: true }), false);
});
