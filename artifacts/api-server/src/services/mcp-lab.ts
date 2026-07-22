export type McpRisk = "read" | "write" | "external-action" | "money" | "unknown";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpServerDescriptor {
  id: string;
  name: string;
  version?: string;
  transport: "stdio" | "http" | "sse" | "connector";
  source?: string;
  tools: McpToolDescriptor[];
}

export interface CapabilityRequest {
  capability: string;
  objective: string;
  preferredTool?: string;
  sampleInput?: Record<string, unknown>;
  allowExternalAction?: boolean;
}

export interface QualifiedTool {
  name: string;
  description: string;
  risk: McpRisk;
  requiredInputs: string[];
  optionalInputs: string[];
  schemaPresent: boolean;
  eligible: boolean;
  rejectionReasons: string[];
}

export interface McpToolPack {
  version: 1;
  id: string;
  server: {
    id: string;
    name: string;
    version: string | null;
    transport: McpServerDescriptor["transport"];
    source: string | null;
  };
  capability: string;
  objective: string;
  status: "verified" | "needs-review" | "rejected";
  selectedTool: QualifiedTool | null;
  alternatives: QualifiedTool[];
  recipe: {
    tool: string;
    arguments: Record<string, unknown>;
    missingRequiredInputs: string[];
    executionMode: "dry-run" | "human-approval-required";
  } | null;
  policy: {
    publisherQualified: boolean;
    gerardMayRequestCapability: boolean;
    octopusMayExecute: boolean;
    requiresHumanApproval: boolean;
  };
  evidence: string[];
  generatedAt: string;
}

export function qualifyMcpServer(
  descriptor: McpServerDescriptor,
  request: CapabilityRequest,
): McpToolPack {
  validateDescriptor(descriptor);
  validateRequest(request);

  const tools = descriptor.tools
    .map(qualifyTool)
    .sort((a, b) => scoreTool(b, request) - scoreTool(a, request) || a.name.localeCompare(b.name));
  const preferred = request.preferredTool
    ? tools.find((tool) => normalize(tool.name) === normalize(request.preferredTool))
    : undefined;
  const selected = preferred?.eligible ? preferred : tools.find((tool) => tool.eligible && scoreTool(tool, request) > 0) ?? null;
  const argumentsForRecipe = selected
    ? buildArguments(selected, request.sampleInput ?? {})
    : null;
  const requiresHumanApproval = Boolean(
    selected && ["write", "external-action", "money", "unknown"].includes(selected.risk),
  );
  const missingRequiredInputs = selected
    ? selected.requiredInputs.filter((key) => !(key in (request.sampleInput ?? {})))
    : [];

  const status: McpToolPack["status"] = !selected
    ? "rejected"
    : missingRequiredInputs.length > 0 || (requiresHumanApproval && !request.allowExternalAction)
      ? "needs-review"
      : "verified";

  return {
    version: 1,
    id: `mcp-tool-pack:${normalize(descriptor.id)}:${normalize(request.capability)}`,
    server: {
      id: descriptor.id,
      name: descriptor.name,
      version: descriptor.version ?? null,
      transport: descriptor.transport,
      source: descriptor.source ?? null,
    },
    capability: request.capability,
    objective: request.objective,
    status,
    selectedTool: selected,
    alternatives: tools.filter((tool) => tool.name !== selected?.name).slice(0, 5),
    recipe: selected
      ? {
          tool: selected.name,
          arguments: argumentsForRecipe ?? {},
          missingRequiredInputs,
          executionMode: requiresHumanApproval ? "human-approval-required" : "dry-run",
        }
      : null,
    policy: {
      publisherQualified: status !== "rejected",
      gerardMayRequestCapability: status !== "rejected",
      octopusMayExecute: status === "verified",
      requiresHumanApproval,
    },
    evidence: buildEvidence(descriptor, request, selected, status, missingRequiredInputs),
    generatedAt: new Date().toISOString(),
  };
}

function qualifyTool(tool: McpToolDescriptor): QualifiedTool {
  const rejectionReasons: string[] = [];
  const schemaPresent = Boolean(tool.inputSchema && typeof tool.inputSchema === "object");
  if (!tool.name?.trim()) rejectionReasons.push("tool-name-missing");
  if (!schemaPresent) rejectionReasons.push("input-schema-missing");

  const properties = record(tool.inputSchema?.properties);
  const required = Array.isArray(tool.inputSchema?.required)
    ? tool.inputSchema?.required.map(String)
    : [];
  const optional = Object.keys(properties).filter((key) => !required.includes(key));

  return {
    name: tool.name,
    description: tool.description?.trim() || "Outil MCP sans description",
    risk: inferRisk(tool),
    requiredInputs: required,
    optionalInputs: optional,
    schemaPresent,
    eligible: rejectionReasons.length === 0,
    rejectionReasons,
  };
}

function scoreTool(tool: QualifiedTool, request: CapabilityRequest): number {
  if (!tool.eligible) return -1000;
  const haystack = normalize(`${tool.name} ${tool.description}`);
  const tokens = normalize(`${request.capability} ${request.objective}`).split(" ").filter((token) => token.length > 2);
  let score = 1;
  for (const token of tokens) if (haystack.includes(token)) score += 8;
  if (request.preferredTool && normalize(tool.name) === normalize(request.preferredTool)) score += 100;
  if (tool.risk === "read") score += 10;
  if (tool.risk === "money") score -= 30;
  return score;
}

function inferRisk(tool: McpToolDescriptor): McpRisk {
  if (tool.annotations?.destructiveHint) return "external-action";
  if (tool.annotations?.readOnlyHint) return "read";
  const text = normalize(`${tool.name} ${tool.description ?? ""}`);
  if (/pay|purchase|buy|billing|credit|invoice/.test(text)) return "money";
  if (/send|publish|post|create|update|delete|write|upload|invite|message/.test(text)) return "write";
  if (/search|read|list|get|find|inspect|analyse|analyze/.test(text)) return "read";
  return "unknown";
}

function buildArguments(tool: QualifiedTool, sampleInput: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([...tool.requiredInputs, ...tool.optionalInputs]);
  return Object.fromEntries(Object.entries(sampleInput).filter(([key]) => allowed.has(key)));
}

function buildEvidence(
  descriptor: McpServerDescriptor,
  request: CapabilityRequest,
  selected: QualifiedTool | null,
  status: McpToolPack["status"],
  missing: string[],
): string[] {
  const evidence = [
    `${descriptor.tools.length} outil(s) MCP inspecté(s)`,
    `capacité demandée: ${request.capability}`,
  ];
  if (selected) evidence.push(`outil retenu: ${selected.name}`, `risque classé: ${selected.risk}`);
  if (missing.length) evidence.push(`entrées obligatoires manquantes: ${missing.join(", ")}`);
  evidence.push(`qualification Publisher: ${status}`);
  return evidence;
}

function validateDescriptor(descriptor: McpServerDescriptor): void {
  if (!descriptor?.id?.trim() || !descriptor?.name?.trim()) throw new Error("MCP server id and name are required");
  if (!Array.isArray(descriptor.tools) || descriptor.tools.length === 0) throw new Error("At least one MCP tool is required");
}

function validateRequest(request: CapabilityRequest): void {
  if (!request?.capability?.trim() || !request?.objective?.trim()) throw new Error("capability and objective are required");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
