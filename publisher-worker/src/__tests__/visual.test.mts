// Le visuel est du SVG produit à la main : deux choses peuvent le casser
// silencieusement, et ce sont exactement celles que ce fichier garde.
//
// 1. L'échappement XML. Un « & » non échappé — « Gérard & Gérard » suffit —
//    rend le document entier invalide, et une balise <img> n'affiche alors
//    rien du tout, sans erreur visible.
// 2. Le retour à la ligne. SVG n'en fait aucun : sans découpe, tout le texte
//    part sur une seule ligne et sort du cadre.
//
// Ce fichier remplace extract-canva-artifact.test.mts, devenu sans objet : il
// gardait un bug du chemin Composio, qui n'existe plus.
//
// Run with: npx tsx --test src/__tests__/visual.test.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeXml, fitTitle, renderVisualSvg, wrapText, VISUAL_WIDTH, VISUAL_HEIGHT } from "../visual.ts";

test("les caractères réservés de XML sont échappés", () => {
  assert.equal(escapeXml("Gérard & Gérard"), "Gérard &amp; Gérard");
  assert.equal(escapeXml('<script>"x"</script>'), "&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  assert.equal(escapeXml("l'île"), "l&apos;île");
});

test("un titre hostile ne casse pas le document ni n'y injecte de balise", () => {
  const svg = renderVisualSvg({ title: 'Rotas & Cie <script>alert("x")</script>', body: "Corps." });

  assert.ok(!svg.includes("<script>"), "aucune balise script ne doit survivre");
  assert.ok(svg.includes("&amp;"), "l'esperluette doit être échappée");
  // Le compte de chevrons ouvrants et fermants doit rester équilibré : c'est
  // le signe le plus simple qu'aucun texte n'a fabriqué de balise.
  assert.equal((svg.match(/</g) || []).length, (svg.match(/>/g) || []).length);
});

test("un texte long est découpé, jamais laissé sur une seule ligne", () => {
  const lines = wrapText("mot ".repeat(200).trim(), 34, 888, 14);

  assert.ok(lines.length > 1, "le texte doit être réparti sur plusieurs lignes");
  assert.ok(lines.length <= 14, "le nombre de lignes doit rester borné");
});

test("un mot plus long qu'une ligne est coupé plutôt que de déborder", () => {
  // Typiquement une URL : sans coupe, elle sortirait du cadre.
  const lines = wrapText("a".repeat(300), 34, 400, 8);

  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(line.length < 300, "aucune ligne ne doit garder le mot entier");
});

test("le texte tronqué le signale par une ellipse", () => {
  const svg = renderVisualSvg({ title: "Titre", body: "phrase longue ".repeat(400) });

  assert.ok(svg.includes("…"), "la coupure doit être visible pour le lecteur");
});

test("sans texte, la carte reste un document valide", () => {
  // Mistral peut échouer : le rendu ne doit pas dépendre de sa réussite.
  const svg = renderVisualSvg({ title: "Titre seul" });

  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.trimEnd().endsWith("</svg>"));
});

test("le format est bien le portrait 4:5 visé", () => {
  const svg = renderVisualSvg({ title: "Titre", body: "Corps" });

  assert.equal(VISUAL_WIDTH, 1080);
  assert.equal(VISUAL_HEIGHT, 1350);
  assert.ok(svg.includes(`viewBox="0 0 ${VISUAL_WIDTH} ${VISUAL_HEIGHT}"`));
});

test("la parcelle et la version apparaissent en pied de carte", () => {
  const svg = renderVisualSvg({ title: "Titre", body: "Corps", parcelId: "poulpe-fiction", iterationNumber: 45 });

  assert.ok(svg.includes("poulpe-fiction"));
  assert.ok(svg.includes("v45"));
});

test("la taille du titre s'adapte pour tenir dans la largeur", () => {
  const court = fitTitle("Rotas");
  const long = fitTitle("Un titre exceptionnellement long qui ne saurait tenir en grand sans déborder du cadre");

  assert.ok(court.size >= long.size, "un titre long doit être rendu plus petit qu'un titre court");
  assert.ok(long.lines.length <= 2, "le titre ne dépasse jamais deux lignes");
  assert.ok(court.lines.length === 1);
});
