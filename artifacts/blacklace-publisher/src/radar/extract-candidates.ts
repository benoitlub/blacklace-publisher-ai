import type { RadarCandidate, RadarScanResult } from "@/models/radar";
import type { SourceKind } from "@/models/knowledge-observatory";

const URL_PATTERN = /(https?:\/\/[^\s)\]]+)/i;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function detectCategory(text: string): string {
  const value = text.toLowerCase();
  if (value.includes("github") || value.includes("repo")) return "Dev tool";
  if (value.includes("prompt") || value.includes("ai") || value.includes("agent")) return "AI tool";
  if (value.includes("crm") || value.includes("sales")) return "Sales / CRM";
  if (value.includes("design") || value.includes("ui")) return "Design / UX";
  if (value.includes("automation") || value.includes("workflow")) return "Automation";
  if (value.includes("content") || value.includes("publish")) return "Content";
  return "SaaS candidat";
}

function detectSourceKind(text: string, url?: string): SourceKind {
  const value = text.toLowerCase();
  if (value.includes("github.com") || url?.includes("github.com")) return "github";
  if (url) return "url";
  if (value.includes("# ") || value.includes("- ")) return "markdown";
  return "text";
}

function detectSignals(text: string): string[] {
  const value = text.toLowerCase();
  const signals: string[] = [];

  if (value.includes("ai") || value.includes("agent") || value.includes("prompt")) signals.push("IA / prompt");
  if (value.includes("github") || value.includes("open source")) signals.push("Signal developpeur");
  if (value.includes("automation") || value.includes("workflow")) signals.push("Automatisation");
  if (value.includes("pricing") || value.includes("subscription") || value.includes("freemium")) signals.push("Business model detectable");
  if (value.includes("react") || value.includes("api") || value.includes("vite")) signals.push("Stack technique probable");

  return signals.length ? signals : ["Candidat detecte depuis source brute"];
}

function computeInterestScore(text: string, signals: string[]): number {
  const value = text.toLowerCase();
  let score = 42 + signals.length * 9;

  if (value.includes("ai")) score += 12;
  if (value.includes("automation")) score += 10;
  if (value.includes("github")) score += 8;
  if (value.includes("builder") || value.includes("no-code") || value.includes("nocode")) score += 8;
  if (value.includes("free") || value.includes("open source")) score += 5;

  return Math.min(score, 96);
}

function cleanCandidateName(line: string, url?: string): string {
  const withoutBullets = line.replace(/^[-*•\d.)\s]+/, "").trim();
  const beforeDash = withoutBullets.split(/\s[-–—:]\s/)[0]?.trim();
  const fromUrl = url?.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const name = beforeDash || fromUrl || "Candidat SaaS";
  return name.length > 48 ? `${name.slice(0, 48)}...` : name;
}

function extractDescription(line: string, name: string): string {
  const description = line.replace(name, "").replace(/^\s*[-–—:]\s*/, "").trim();
  return description || "Description courte a enrichir par observation.";
}

export function extractRadarCandidates(rawSource: string): RadarScanResult {
  const lines = rawSource
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates: RadarCandidate[] = lines.map((line) => {
    const url = line.match(URL_PATTERN)?.[1];
    const sourceKind = detectSourceKind(line, url);
    const signals = detectSignals(line);
    const name = cleanCandidateName(line, url);
    const description = extractDescription(line, name);
    const category = detectCategory(line);
    const interestScore = computeInterestScore(line, signals);

    return {
      id: createId("candidate"),
      name,
      sourceKind,
      sourceValue: url || line,
      description,
      detectedUrl: url,
      category,
      interestScore,
      signals,
      tags: [category, ...signals].map((tag) => tag.toLowerCase()),
    };
  }).sort((a, b) => b.interestScore - a.interestScore);

  return {
    id: createId("radar-scan"),
    createdAt: new Date().toISOString(),
    rawSource,
    candidates,
  };
}
