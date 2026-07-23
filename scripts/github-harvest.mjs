import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const apiKey = process.env.MISTRAL_API_KEY?.trim();
const requestPath = join(process.cwd(), "public", "missions", "request.json");

async function readQueuedRequest() {
  try {
    return JSON.parse(await readFile(requestPath, "utf8"));
  } catch {
    return {};
  }
}

const queued = await readQueuedRequest();
const parcelId = String(process.env.HARVEST_PARCEL_ID || queued.parcelId || "general").trim();
const parcelName = String(process.env.HARVEST_PARCEL_NAME || queued.parcelName || parcelId).trim();
const objective = String(process.env.HARVEST_OBJECTIVE || queued.objective || "Préparer une récolte éditoriale directement exploitable.").trim();
const context = String(process.env.HARVEST_CONTEXT || queued.context || "").trim();
const seedId = String(process.env.HARVEST_SEED_ID || queued.seedId || "").trim();
const requestId = String(process.env.HARVEST_REQUEST_ID || queued.requestId || "").trim();
const model = String(process.env.MISTRAL_MODEL || "mistral-small-latest").trim();

if (!apiKey) throw new Error("MISTRAL_API_KEY is required");
if (!parcelId) throw new Error("HARVEST_PARCEL_ID is required");
if (!objective) throw new Error("HARVEST_OBJECTIVE is required");

const prompt = [
  "Tu es Blacklace Publisher.",
  "Prépare une récolte éditoriale concrète, révisable et immédiatement exploitable.",
  `Parcelle: ${parcelName} (${parcelId})`,
  `Objectif: ${objective}`,
  context ? `Contexte vérifié:\n${context}` : "N'invente aucun fait absent du contexte fourni.",
  "Réponds en français avec ces sections: Résultat, Texte prêt à publier, Plan d'action, Éléments à vérifier.",
].join("\n\n");

const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model,
    temperature: 0.35,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!response.ok) {
  const detail = await response.text().catch(() => "");
  throw new Error(`Mistral request failed (${response.status}): ${detail.slice(0, 500)}`);
}

const payload = await response.json();
const content = payload?.choices?.[0]?.message?.content;
if (typeof content !== "string" || !content.trim()) throw new Error("Mistral returned no usable content");

const now = new Date();
const operationId = requestId || `github-${now.toISOString().replace(/[:.]/g, "-")}`;
const harvest = {
  version: 2,
  operationId,
  requestId: requestId || null,
  parcelId,
  parcelName,
  seedId: seedId || null,
  title: objective,
  objective,
  status: "completed",
  source: "blacklace-publisher-github-actions",
  provider: "mistral",
  model,
  usage: payload?.usage || null,
  content: content.trim(),
  completedAt: now.toISOString(),
};

const outputDir = join(process.cwd(), "public", "harvests");
const parcelDir = join(outputDir, parcelId);
await mkdir(parcelDir, { recursive: true });
await writeFile(join(outputDir, "latest.json"), `${JSON.stringify(harvest, null, 2)}\n`, "utf8");
await writeFile(join(outputDir, `${operationId}.json`), `${JSON.stringify(harvest, null, 2)}\n`, "utf8");
await writeFile(join(parcelDir, "latest.json"), `${JSON.stringify(harvest, null, 2)}\n`, "utf8");
await writeFile(join(outputDir, "latest.md"), `# ${parcelName}\n\n${content.trim()}\n`, "utf8");

console.log(`Harvest completed: ${operationId}`);