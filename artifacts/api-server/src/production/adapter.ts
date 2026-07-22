import type { ProductionRequest } from "./producer";

export interface ProducedDeliverable {
  filename: string;
  mediaType: "text/markdown" | "text/html";
  content: string;
}

function markdownFacts(facts: string[]): string {
  return facts.length ? facts.map((fact) => `- ${fact}`).join("\n") : "- Aucun fait exploitable.";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function produceDeliverable(request: ProductionRequest): ProducedDeliverable {
  const slug = request.parcelId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "parcel";

  switch (request.deliverableKind) {
    case "instagram-post":
      return {
        filename: `${slug}-instagram-post.md`,
        mediaType: "text/markdown",
        content: `# ${request.parcelName}\n\n${request.summary}\n\n${request.facts.slice(0, 5).join("\n\n")}\n\n#${slug.replace(/-/g, " #")}`,
      };
    case "landing-page":
      return {
        filename: `${slug}-landing-page.html`,
        mediaType: "text/html",
        content: `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(request.title)}</title></head><body><main><h1>${escapeHtml(request.parcelName)}</h1><p>${escapeHtml(request.summary)}</p><h2>À retenir</h2><ul>${request.facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul></main></body></html>`,
      };
    case "newsletter":
      return {
        filename: `${slug}-newsletter.md`,
        mediaType: "text/markdown",
        content: `# ${request.parcelName}\n\n${request.summary}\n\n## Ce qu'il faut retenir\n\n${markdownFacts(request.facts)}\n`,
      };
    case "documentation":
    default:
      return {
        filename: `${slug}-documentation.md`,
        mediaType: "text/markdown",
        content: `# ${request.parcelName}\n\n${request.summary}\n\n## Connaissances vérifiées\n\n${markdownFacts(request.facts)}\n\n---\nKnowledge Package v${request.knowledgePackageVersion}\n`,
      };
  }
}
