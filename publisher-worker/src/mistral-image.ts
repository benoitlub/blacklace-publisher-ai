import type { SecretsStoreSecret } from "./worker";

/**
 * Génération d'images par Mistral, pour le fond des cartes de Gérard.
 *
 * Pourquoi Mistral et pas Canva
 * -----------------------------
 * La Canva Connect API ne compose pas de texte sur un compte gratuit, et son
 * seul outil de génération par IA vit dans le connecteur MCP — lequel rend
 * *quatre candidats* qu'un humain choisit. Gérard tourne toutes les quinze
 * minutes sans personne devant l'écran : un outil à choix humain n'y a pas sa
 * place.
 *
 * Mistral, lui, est déjà configuré ici (MISTRAL_API_KEY) et expose la
 * génération d'images comme un outil de l'API Conversations — moteur
 * FLUX1.1 [pro] Ultra. Pas de compte à connecter, pas d'OAuth, pas de
 * connecteur supplémentaire à maintenir.
 *
 * Le partage des rôles
 * --------------------
 * Mistral fournit **l'image**, jamais le texte : les modèles de diffusion
 * écrivent mal, et un titre illisible incrusté dans un fond serait pire que
 * pas de titre du tout. Le prompt le demande donc explicitement sans lettrage,
 * et `visual.ts` pose la typographie par-dessus.
 */

const MISTRAL_BASE_URL = "https://api.mistral.ai";

/** Modèle porteur de l'outil ; le rendu vient de FLUX, pas de lui. */
const IMAGE_CONVERSATION_MODEL = "mistral-medium-latest";

export interface MistralImageEnv {
  MISTRAL_API_KEY?: string | SecretsStoreSecret;
  AI_API_KEY?: string | SecretsStoreSecret;
}

async function secretValue(value: string | SecretsStoreSecret | undefined): Promise<string> {
  if (typeof value === "string") return value.trim();
  if (value && typeof (value as SecretsStoreSecret).get === "function") {
    try {
      const resolved = await (value as SecretsStoreSecret).get();
      return typeof resolved === "string" ? resolved.trim() : "";
    } catch (_) {
      return "";
    }
  }
  return "";
}

async function apiKey(env: MistralImageEnv): Promise<string> {
  return (await secretValue(env.AI_API_KEY)) || (await secretValue(env.MISTRAL_API_KEY));
}

/**
 * Construit le prompt d'image à partir de la parcelle.
 *
 * Deux consignes non négociables : aucun texte (voir plus haut), et un cadrage
 * qui laisse la zone haute lisible, puisque le titre s'y posera.
 */
export function buildImagePrompt(input: { title: string; objective?: string | null }): string {
  const subject = [input.title, input.objective?.trim()].filter(Boolean).join(". ");
  return [
    `Illustration d'ambiance pour l'univers narratif Blacklace Island : ${subject}.`,
    "Peinture numérique atmosphérique, insulaire et mystérieuse, palette bleu nuit profond et sable chaud, lumière rasante, brume marine.",
    "Composition verticale, sujet décentré vers le bas, partie haute dégagée et sombre.",
    "SANS AUCUN TEXTE, sans lettrage, sans titre, sans logo, sans filigrane, sans typographie d'aucune sorte.",
  ].join(" ");
}

export class MistralImageError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "MistralImageError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Cherche l'identifiant de fichier dans la réponse.
 *
 * Le résultat n'est pas à une place fixe : il arrive dans un bloc `tool_file`
 * niché dans le `content` d'une des entrées de sortie. On parcourt plutôt que
 * de parier sur un chemin — c'est exactement ce genre de pari qui avait fait
 * prendre le `log_id` de Composio pour un identifiant de design.
 */
export function extractFileId(payload: unknown): string | null {
  let found: string | null = null;

  const walk = (value: unknown, depth: number): void => {
    if (found || depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    if (value.type === "tool_file") {
      const id = value.file_id ?? value.fileId;
      if (typeof id === "string" && id.trim()) {
        found = id.trim();
        return;
      }
    }
    for (const item of Object.values(value)) walk(item, depth + 1);
  };

  walk(payload, 0);
  return found;
}

/**
 * Demande une image et rend l'identifiant du fichier produit.
 *
 * Lève plutôt que de rendre `null` : l'appelant décide s'il enregistre une
 * carte sans fond, et la raison doit lui parvenir intacte.
 */
export async function generateImage(env: MistralImageEnv, prompt: string): Promise<string> {
  const key = await apiKey(env);
  if (!key) throw new MistralImageError("MISTRAL_API_KEY n'est pas configuré.");

  const response = await fetch(`${MISTRAL_BASE_URL}/v1/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      model: IMAGE_CONVERSATION_MODEL,
      inputs: prompt,
      tools: [{ type: "image_generation" }],
      // Rien à conserver côté Mistral : le fichier suffit, et la conversation
      // n'a aucun intérêt une fois l'image produite.
      store: false,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new MistralImageError(`Mistral ${response.status}: ${text.slice(0, 300)}`, response.status);
  }

  let payload: unknown;
  try { payload = JSON.parse(text); } catch (_) {
    throw new MistralImageError("Réponse Mistral illisible.");
  }

  const fileId = extractFileId(payload);
  if (!fileId) throw new MistralImageError("Aucun fichier image dans la réponse Mistral.");
  return fileId;
}

/** Encode en base64 par tranches — `String.fromCharCode(...)` déborde la pile sur 2 Mo. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * Rend l'image sous forme de `data:` URI.
 *
 * Un SVG affiché dans une balise `<img>` ne charge aucune ressource externe :
 * référencer l'image par URL donnerait une carte au fond vide. Elle doit donc
 * être embarquée dans le document.
 */
export async function imageDataUri(env: MistralImageEnv, fileId: string): Promise<string> {
  const key = await apiKey(env);
  if (!key) throw new MistralImageError("MISTRAL_API_KEY n'est pas configuré.");

  const response = await fetch(`${MISTRAL_BASE_URL}/v1/files/${encodeURIComponent(fileId)}/content`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new MistralImageError(`Mistral ${response.status} en récupérant ${fileId}: ${detail.slice(0, 200)}`, response.status);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return `data:${contentType};base64,${toBase64(await response.arrayBuffer())}`;
}
