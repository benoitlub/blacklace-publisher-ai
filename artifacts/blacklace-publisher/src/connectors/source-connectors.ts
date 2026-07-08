import type { ObservatorySourceInput, SourceReference } from "@/models/knowledge-observatory";

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeSource(input: ObservatorySourceInput): SourceReference {
  const value = input.value.trim();
  const fallbackLabel = value.length > 64 ? `${value.slice(0, 64)}...` : value;

  return {
    id: createId("source"),
    kind: input.kind,
    label: input.title?.trim() || fallbackLabel || "Source sans titre",
    value,
    capturedAt: new Date().toISOString(),
  };
}

export function getSourceKindLabel(kind: ObservatorySourceInput["kind"]): string {
  switch (kind) {
    case "url":
      return "URL";
    case "github":
      return "Depot GitHub";
    case "markdown":
      return "Markdown";
    case "pdf":
      return "PDF";
    case "text":
    default:
      return "Texte";
  }
}
