// Le placement du texte dans un brand template est la seule partie devinable
// de l'intégration Canva : les noms des champs sont choisis par celui qui a
// dessiné le template, pas par nous. On les lit via l'API, mais il faut ensuite
// décider quel champ reçoit le titre et quels champs reçoivent le corps.
//
// Ce fichier remplace extract-canva-artifact.test.mts, devenu sans objet : il
// gardait un bug (le log_id de Composio pris pour un design id) dans un chemin
// de code qui n'existe plus, Canva étant désormais appelée en direct.
//
// Run with: npx tsx --test src/__tests__/canva-template-fields.test.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapTextToTemplateFields, type BrandTemplateField } from "../canva.ts";

const fields = (...entries: Array<[string, string]>): BrandTemplateField[] =>
  entries.map(([name, type]) => ({ name, type }));

test("le champ qui ressemble à un titre reçoit le titre, les autres le corps", () => {
  const data = mapTextToTemplateFields(
    fields(["titre_principal", "text"], ["corps", "text"]),
    { title: "Rotas — place du marché", body: "La fontaine centrale, pierre chaude." },
  );

  assert.deepEqual(data["titre_principal"], { type: "text", text: "Rotas — place du marché" });
  assert.deepEqual(data["corps"], { type: "text", text: "La fontaine centrale, pierre chaude." });
});

test("les champs non textuels sont ignorés — une image ne se remplit pas avec du texte", () => {
  const data = mapTextToTemplateFields(
    fields(["titre", "text"], ["photo", "image"], ["clip", "video"]),
    { title: "Titre", body: "Corps" },
  );

  assert.deepEqual(Object.keys(data), ["titre"]);
});

test("sans champ évoquant un titre, le premier champ texte le porte", () => {
  // Sinon le titre disparaîtrait purement et simplement du visuel.
  const data = mapTextToTemplateFields(
    fields(["bloc_a", "text"], ["bloc_b", "text"]),
    { title: "Titre", body: "Corps" },
  );

  assert.equal(data["bloc_a"].text, "Titre");
  assert.equal(data["bloc_b"].text, "Corps");
});

test("sans corps, les champs retombent sur le titre plutôt que de rester vides", () => {
  // Mistral peut échouer sur un cycle : le visuel doit rester lisible.
  const data = mapTextToTemplateFields(fields(["titre", "text"], ["corps", "text"]), { title: "Titre seul" });

  assert.equal(data["titre"].text, "Titre seul");
  assert.equal(data["corps"].text, "Titre seul");
});

test("un template sans champ texte ne produit aucune donnée", () => {
  // L'appelant s'en sert pour refuser l'autofill au lieu de fabriquer un
  // visuel muet — c'est ce qui distingue un échec nommé d'un faux succès.
  const data = mapTextToTemplateFields(fields(["photo", "image"]), { title: "Titre", body: "Corps" });

  assert.deepEqual(data, {});
});

test("le corps vide est traité comme absent, pas comme une valeur", () => {
  const data = mapTextToTemplateFields(fields(["titre", "text"], ["corps", "text"]), { title: "Titre", body: "   " });

  assert.equal(data["corps"].text, "Titre");
});
