import type { AiTaskType } from "./task-types";

export interface AiGatewayRequest {
  readonly task: AiTaskType;
  readonly prompt: string;
  readonly system?: string;
  readonly universe?: string;
  readonly agent?: string;
  readonly preferredProvider?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface AiGatewayUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCost?: number;
}

export interface AiGatewayResponse {
  readonly ok: boolean;
  readonly provider: string;
  readonly model?: string;
  readonly output: string;
  readonly usage?: AiGatewayUsage;
  readonly fallbackUsed?: boolean;
  readonly error?: string;
}

export interface AiProvider {
  readonly id: string;
  readonly model?: string;
  readonly isFreeTier: boolean;
  isConfigured(): boolean;
  supports(task: AiTaskType): boolean;
  generate(request: AiGatewayRequest): Promise<AiGatewayResponse>;
}
