import { isAiTaskType } from "./task-types";
import { AiGatewayRouter } from "./router";
import type { AiGatewayRequest } from "./types";

export type { AiTaskType } from "./task-types";
export type { AiGatewayRequest, AiGatewayResponse, AiGatewayUsage, AiProvider } from "./types";

const router = new AiGatewayRouter();

export const aiGateway = {
  generate(request: AiGatewayRequest) {
    return router.generate(request);
  },
  getStatus() {
    return router.getStatus();
  }
};

export function parseAiGatewayRequest(value: unknown): AiGatewayRequest | null {
  const request = value as Partial<AiGatewayRequest>;
  if (!isAiTaskType(request.task) || typeof request.prompt !== "string" || !request.prompt.trim()) {
    return null;
  }

  return {
    task: request.task,
    prompt: request.prompt,
    system: typeof request.system === "string" ? request.system : undefined,
    universe: typeof request.universe === "string" ? request.universe : undefined,
    agent: typeof request.agent === "string" ? request.agent : undefined,
    preferredProvider: typeof request.preferredProvider === "string" ? request.preferredProvider : undefined,
    maxTokens: typeof request.maxTokens === "number" ? request.maxTokens : undefined,
    temperature: typeof request.temperature === "number" ? request.temperature : undefined,
    metadata: isRecord(request.metadata) ? request.metadata : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
