/**
 * Les visuels de Gérard, dessinés par le Worker lui-même.
 *
 * Pourquoi ici, et pas chez Canva
 * -------------------------------
 * La Canva Connect API ne compose pas de texte sur un compte gratuit :
 *
 * - `POST /v1/designs` ne crée qu'un design **vide** ;
 * - `POST /v1/autofills`, la seule voie qui pose vraiment du texte, exige un
 *   compte Canva Enterprise (essai limité réservé aux offres payantes), et les
 *   brand templates eux-mêmes demandent Pro ou mieux ;
 * - aucun endpoint de génération par IA n'existe dans l'API publique.
 *
 * Passer par Composio ne changeait rien — c'était même pire : son catalogue
 * Canva n'exposait qu'un outil réclamant un `asset_id` qu'il ne permettait pas
 * de créer. Quarante-cinq itérations y ont échoué en silence.
 *
 * Un SVG rendu ici n'a besoin de rien : ni compte, ni OAuth, ni quota, ni
 * limite de débit, ni réseau. Et la mise en page nous appartient, donc
 * l'identité Blacklace aussi.
 *
 * Rendu à la demande, jamais stocké
 * ---------------------------------
 * Le SVG n'est pas enregistré : il est recalculé depuis le texte déjà en base.
 * Deux conséquences voulues — aucun octet à stocker ou à faire expirer, et
 * toute amélioration du dessin s'applique rétroactivement aux 779 itérations
 * déjà là.
 */

/** Instagram portrait 4:5 — le format que le cycle visait déjà. */
export const VISUAL_WIDTH = 1080;
export const VISUAL_HEIGHT = 1350;

const MARGIN = 96;
const CONTENT_WIDTH = VISUAL_WIDTH - MARGIN * 2;

export interface VisualInput {
  title: string;
  body?: string | null;
  parcelId?: string | null;
  iterationNumber?: number | null;
}

/**
 * XML, pas HTML : `&` non échappé casse le document entier, et un titre
 * contenant « Gérard & Gérard » suffirait à le faire.
 */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&apos;";
    }
  });
}

/**
 * Largeur moyenne d'un caractère, en fraction de la taille de police.
 *
 * Mesurée sur un rendu réel plutôt que devinée : une première version utilisait
 * 0.52 pour tout, et le titre en gras frôlait le bord droit — le gras est
 * nettement plus large que le romain. Ces valeurs laissent une marge : une
 * ligne un peu courte ne se voit pas, une ligne trop longue déborde.
 */
const REGULAR_WIDTH_FACTOR = 0.52;
const BOLD_WIDTH_FACTOR = 0.64;

/**
 * Découpe un texte en lignes tenant dans `maxWidth`.
 *
 * SVG n'a pas de retour à la ligne automatique : sans ce calcul, tout le texte
 * part sur une seule ligne et déborde hors du cadre. Faute de moteur de texte
 * dans un Worker, la largeur est estimée à partir de la taille de police.
 */
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number, widthFactor = REGULAR_WIDTH_FACTOR): string[] {
  const avgCharWidth = fontSize * widthFactor;
  const charsPerLine = Math.max(8, Math.floor(maxWidth / avgCharWidth));
  const lines: string[] = [];

  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= charsPerLine) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // Un mot plus long qu'une ligne entière (une URL, typiquement) est coupé
      // net plutôt que de déborder.
      if (word.length > charsPerLine) {
        let rest = word;
        while (rest.length > charsPerLine) {
          lines.push(rest.slice(0, charsPerLine - 1) + "-");
          rest = rest.slice(charsPerLine - 1);
        }
        current = rest;
      } else {
        current = word;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length >= maxLines) break;
  }

  if (lines.length > maxLines) lines.length = maxLines;
  return lines;
}

/**
 * Coupe la dernière ligne pour y loger une ellipse, plutôt que d'arrêter le
 * texte au milieu d'un mot sans prévenir le lecteur qu'il en manque.
 */
function withEllipsis(lines: string[], truncated: boolean): string[] {
  if (!truncated || lines.length === 0) return lines;
  const last = lines[lines.length - 1];
  return [...lines.slice(0, -1), last.replace(/[\s.,;:!?—-]+$/, "") + " …"];
}

/**
 * Choisit la plus grande taille de titre qui tienne en deux lignes au plus.
 *
 * À taille fixe, « Rotas — place du marché » passait à deux lignes alors qu'il
 * pouvait tenir sur une, un peu plus petit. Réduire la taille avant de couper
 * donne un titre plus franc — et évite qu'un titre long dévore la carte.
 */
export function fitTitle(title: string): { size: number; lines: string[] } {
  const MAX_TITLE_LINES = 2;
  for (const size of [72, 68, 64, 60, 56, 52, 48, 44]) {
    const lines = wrapText(title, size, CONTENT_WIDTH, MAX_TITLE_LINES + 1, BOLD_WIDTH_FACTOR);
    if (lines.length <= MAX_TITLE_LINES) return { size, lines };
  }
  // Titre exceptionnellement long : on coupe à la plus petite taille.
  return { size: 44, lines: wrapText(title, 44, CONTENT_WIDTH, MAX_TITLE_LINES, BOLD_WIDTH_FACTOR) };
}

function textBlock(lines: string[], options: { x: number; y: number; lineHeight: number; className: string }): string {
  return lines
    .map((line, index) => `<text class="${options.className}" x="${options.x}" y="${options.y + index * options.lineHeight}">${escapeXml(line)}</text>`)
    .join("\n    ");
}

/**
 * Rend la carte. Fonction pure : mêmes entrées, même SVG — c'est ce qui permet
 * de la recalculer à la volée à chaque requête sans rien mémoriser.
 */
export function renderVisualSvg(input: VisualInput): string {
  const title = input.title?.trim() || "Sans titre";
  const rawBody = input.body?.trim() || "";

  const BODY_SIZE = 34;
  const BODY_MAX_LINES = 14;

  const { size: titleSize, lines: titleLines } = fitTitle(title);
  const bodyAll = rawBody ? wrapText(rawBody, BODY_SIZE, CONTENT_WIDTH, BODY_MAX_LINES + 1) : [];
  const bodyLines = withEllipsis(bodyAll.slice(0, BODY_MAX_LINES), bodyAll.length > BODY_MAX_LINES);

  const titleLineHeight = titleSize * 1.18;
  const bodyLineHeight = BODY_SIZE * 1.55;
  const GAP = 72;

  const titleTop = 300;
  const bodyTop = titleTop + titleLines.length * titleLineHeight + GAP;

  const version = input.iterationNumber ? `v${input.iterationNumber}` : null;
  const footer = [input.parcelId?.trim() || null, version].filter(Boolean).join("  ·  ");

  // Police système : un SVG affiché dans une balise <img> ne peut charger
  // aucune police distante, donc on ne compte que sur des familles génériques.
  const fontStack = "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VISUAL_WIDTH}" height="${VISUAL_HEIGHT}" viewBox="0 0 ${VISUAL_WIDTH} ${VISUAL_HEIGHT}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d1b2a"/>
      <stop offset="100%" stop-color="#061019"/>
    </linearGradient>
    <style>
      .title { font-family: ${fontStack}; font-size: ${titleSize}px; font-weight: 700; fill: #f4ecd8; letter-spacing: -0.5px; }
      .body  { font-family: ${fontStack}; font-size: ${BODY_SIZE}px; font-weight: 400; fill: #c8d4e0; }
      .eyebrow { font-family: ${fontStack}; font-size: 26px; font-weight: 600; fill: #d9a441; letter-spacing: 4px; }
      .footer { font-family: ${fontStack}; font-size: 26px; font-weight: 500; fill: #7b8fa3; letter-spacing: 1px; }
    </style>
  </defs>

  <rect width="${VISUAL_WIDTH}" height="${VISUAL_HEIGHT}" fill="url(#ground)"/>
  <rect x="${MARGIN}" y="176" width="128" height="5" fill="#d9a441"/>
  <text class="eyebrow" x="${MARGIN}" y="148">BLACKLACE ISLAND</text>

  <g>
    ${textBlock(titleLines, { x: MARGIN, y: titleTop, lineHeight: titleLineHeight, className: "title" })}
  </g>

  <g>
    ${textBlock(bodyLines, { x: MARGIN, y: bodyTop, lineHeight: bodyLineHeight, className: "body" })}
  </g>

  <rect x="${MARGIN}" y="${VISUAL_HEIGHT - 148}" width="${CONTENT_WIDTH}" height="1" fill="#1e3448"/>
  ${footer ? `<text class="footer" x="${MARGIN}" y="${VISUAL_HEIGHT - 96}">${escapeXml(footer)}</text>` : ""}
</svg>`;
}
