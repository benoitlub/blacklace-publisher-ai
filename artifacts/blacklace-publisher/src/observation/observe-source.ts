import type { Observation, SourceReference } from "@/models/knowledge-observatory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function detectTechnologies(value: string): string[] {
  const text = value.toLowerCase();
  const technologies = new Set<string>();

  if (text.includes("github") || text.includes("repo")) technologies.add("GitHub");
  if (text.includes("react")) technologies.add("React");
  if (text.includes("vite")) technologies.add("Vite");
  if (text.includes("api")) technologies.add("API");
  if (text.includes("notion")) technologies.add("Notion");
  if (text.includes("mistral")) technologies.add("Mistral");
  if (text.includes("stripe") || text.includes("pricing") || text.includes("subscription")) technologies.add("Paiement / abonnement");
  if (text.includes("automation") || text.includes("workflow")) technologies.add("Automatisation");

  return technologies.size ? [...technologies] : ["Web", "SaaS", "Analyse locale"];
}

function detectCategory(source: SourceReference): string {
  if (source.kind === "github") return "Depot logiciel";
  if (source.kind === "pdf") return "Document";
  if (source.kind === "markdown") return "Documentation";
  if (source.kind === "url") return "Site web / SaaS";
  return "Texte source";
}

export function observeSource(source: SourceReference): Observation {
  const shortValue = source.value.length > 180 ? `${source.value.slice(0, 180)}...` : source.value;
  const detectedTechnologies = detectTechnologies(source.value);

  return {
    id: createId("observation"),
    source,
    summary: source.kind === "pdf"
      ? "PDF recu comme placeholder : le pipeline est pret, mais l'extraction reelle du fichier viendra avec un connecteur dedie."
      : `Observation locale de la source : ${shortValue || source.label}.`,
    category: detectCategory(source),
    confidence: source.value.length > 40 ? 0.74 : 0.52,
    language: /[àâçéèêëîïôùûüÿñæœ]/i.test(source.value) ? "fr" : "unknown",
    detectedTechnologies,
    rawSignals: [
      `Type de source : ${source.kind}`,
      `Longueur analysee : ${source.value.length} caracteres`,
      `Technologies supposees : ${detectedTechnologies.join(", ")}`,
    ],
    createdAt: new Date().toISOString(),
  };
}
