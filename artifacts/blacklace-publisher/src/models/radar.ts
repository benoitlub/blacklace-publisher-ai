import type { SourceKind } from "@/models/knowledge-observatory";

export interface RadarCandidate {
  id: string;
  name: string;
  sourceKind: SourceKind;
  sourceValue: string;
  description: string;
  detectedUrl?: string;
  category: string;
  interestScore: number;
  signals: string[];
  tags: string[];
}

export interface RadarScanResult {
  id: string;
  createdAt: string;
  rawSource: string;
  candidates: RadarCandidate[];
}
