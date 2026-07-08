import type { Observation, SourceReference } from "@/models/knowledge-observatory";
import { describeGitHubSource, parseGitHubSource } from "@/connectors/github-source";

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
  if (text.includes("sdk")) technologies.add("SDK");
  if (text.includes("mcp")) technologies.add("MCP");
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

function buildSummary(source: SourceReference): string {
  if (source.kind === "pdf") {
    return "PDF recu comme placeholder : le pipeline est pret, mais l'extraction reelle du fichier viendra avec un connecteur dedie.";
  }

  if (source.kind === "github") {
    return describeGitHubSource(source.value) ?? `Depot GitHub a observer : ${source.value}.`;
  }

  const shortValue = source.value.length > 180 ? `${source.value.slice(0, 180)}...` : source.value;
  return `Observation locale de la source : ${shortValue || source.label}.`;
}

export function observeSource(source: SourceReference): Observation {
  const github = source.kind === "github" ? parseGitHubSource(source.value) : null;
  const detectedTechnologies = detectTechnologies(source.value);
  if (github) detectedTechnologies.unshift("Open source", "Repository", "README potentiel");

  return {
    id: createId("observation"),
    source,
    summary: buildSummary(source),
    category: detectCategory(source),
    confidence: github ? 0.78 : source.value.length > 40 ? 0.74 : 0.52,
    language: /[àâçéèêëîïôùûüÿñæœ]/i.test(source.value) ? "fr" : "unknown",
    detectedTechnologies,
    rawSignals: [
      `Type de source : ${source.kind}`,
      `Longueur analysee : ${source.value.length} caracteres`,
      github ? `Depot : ${github.fullName}` : null,
      github?.branch ? `Branche : ${github.branch}` : null,
      github?.path ? `Chemin : ${github.path}` : null,
      `Technologies supposees : ${detectedTechnologies.join(", ")}`,
    ].filter(Boolean) as string[],
    createdAt: new Date().toISOString(),
  };
}
