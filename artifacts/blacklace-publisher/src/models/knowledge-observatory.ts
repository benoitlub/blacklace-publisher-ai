export type SourceKind = "url" | "github" | "text" | "markdown" | "pdf";

export interface SourceReference {
  id: string;
  kind: SourceKind;
  label: string;
  value: string;
  capturedAt: string;
}

export interface ObservatorySourceInput {
  kind: SourceKind;
  value: string;
  title?: string;
}

export interface Observation {
  id: string;
  source: SourceReference;
  summary: string;
  category: string;
  confidence: number;
  language: string;
  detectedTechnologies: string[];
  rawSignals: string[];
  createdAt: string;
}

export interface KnowledgeExtraction {
  id: string;
  observationId: string;
  features: string[];
  businessModel: string[];
  ux: string[];
  assumedArchitecture: string[];
  possibleAutomations: string[];
  promptPatterns: string[];
  workflowPatterns: string[];
  innovations: string[];
  risks: string[];
  strengths: string[];
  weaknesses: string[];
}

export interface KnowledgeTheme {
  id: string;
  title: string;
  items: string[];
}

export interface KnowledgePack {
  id: string;
  title: string;
  summary: string;
  capabilities: string[];
  patterns: string[];
  recommendations: string[];
  tags: string[];
  confidence: number;
  generatedAt: string;
  sourceReferences: SourceReference[];
  themes: KnowledgeTheme[];
}

export interface OctopusExportResult {
  exported: boolean;
  mode: "mock";
  message: string;
  packId: string;
  exportedAt: string;
}

export interface KnowledgeObservatoryResult {
  observation: Observation;
  extraction: KnowledgeExtraction;
  knowledge: KnowledgeTheme[];
  pack: KnowledgePack;
  exportResult: OctopusExportResult;
}
