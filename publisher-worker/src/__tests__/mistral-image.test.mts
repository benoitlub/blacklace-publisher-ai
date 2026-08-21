// La génération d'images tient sur deux points fragiles, tous deux invisibles
// s'ils cassent : où trouver l'identifiant de fichier dans la réponse, et ce
// que le prompt interdit au modèle.
//
// Run with: npx tsx --test src/__tests__/mistral-image.test.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImagePrompt, extractFileId } from "../mistral-image.ts";

test("l'identifiant de fichier est retrouvé où qu'il soit niché", () => {
  // La forme réelle : un bloc tool_file dans le content d'une entrée de sortie.
  // On parcourt plutôt que de parier sur un chemin — c'est ce genre de pari qui
  // avait fait prendre le log_id de Composio pour un identifiant de design.
  const payload = {
    object: "conversation.response",
    outputs: [
      { type: "message.output", content: [{ type: "text", text: "Voici" }, { type: "tool_file", tool: "image_generation", file_id: "file-abc123" }] },
    ],
  };

  assert.equal(extractFileId(payload), "file-abc123");
});

test("la variante camelCase est acceptée", () => {
  assert.equal(extractFileId({ outputs: [{ content: [{ type: "tool_file", fileId: "file-xyz" }] }] }), "file-xyz");
});

test("un identifiant qui n'est pas un tool_file n'est jamais retenu", () => {
  // Un id de conversation ou d'entrée ne doit pas passer pour un fichier.
  const payload = { conversation_id: "conv-1", outputs: [{ id: "entry-1", type: "message.output", content: [{ type: "text", text: "rien" }] }] };

  assert.equal(extractFileId(payload), null);
});

test("une réponse vide ou malformée rend null sans lever", () => {
  assert.equal(extractFileId(null), null);
  assert.equal(extractFileId({}), null);
  assert.equal(extractFileId([]), null);
  assert.equal(extractFileId("texte"), null);
});

test("le prompt interdit explicitement tout texte dans l'image", () => {
  // Les modèles de diffusion écrivent mal : un titre illisible incrusté dans
  // le fond serait pire que pas de titre. La typographie est posée par-dessus,
  // en SVG.
  const prompt = buildImagePrompt({ title: "Rotas", objective: "La place du marché" });

  assert.match(prompt, /SANS AUCUN TEXTE/);
  assert.match(prompt, /sans lettrage/);
});

test("le prompt réserve la zone haute, où le titre se posera", () => {
  const prompt = buildImagePrompt({ title: "Rotas" });

  assert.match(prompt, /partie haute dégagée/);
});

test("un objectif absent ne laisse pas de ponctuation orpheline", () => {
  const prompt = buildImagePrompt({ title: "Rotas", objective: null });

  assert.ok(!prompt.includes("Rotas. ."), "pas de point flottant");
  assert.match(prompt, /Rotas\./);
});
