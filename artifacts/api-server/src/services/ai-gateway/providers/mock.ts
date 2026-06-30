import type { AiGatewayRequest, AiGatewayResponse, AiProvider } from "../types";

export class MockAiProvider implements AiProvider {
  readonly id = "mock";
  readonly model = "mock-ai-gateway-v1";
  readonly isFreeTier = true;

  isConfigured(): boolean {
    return true;
  }

  supports(): boolean {
    return true;
  }

  async generate(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    return {
      ok: true,
      provider: this.id,
      model: this.model,
      output: createMockOutput(request),
      usage: {
        inputTokens: estimateTokens(request.prompt),
        outputTokens: 80,
        estimatedCost: 0
      }
    };
  }
}

function createMockOutput(request: AiGatewayRequest): string {
  const context = [request.universe, request.agent].filter(Boolean).join(" / ");
  const prefix = context ? `[${context}] ` : "";

  switch (request.task) {
    case "text.post":
      return `${prefix}Post mock pret a adapter : ${request.prompt.trim()}`;
    case "text.thread":
      return `${prefix}Thread mock en 3 points:\n1. Contexte: ${request.prompt.trim()}\n2. Angle principal\n3. Appel a l'action`;
    case "text.summary":
      return `${prefix}Resume mock: ${request.prompt.trim().slice(0, 240)}`;
    case "image.prompt":
      return `${prefix}Prompt image mock: scene claire, sujet lisible, style coherent. Sujet: ${request.prompt.trim()}`;
    case "video.prompt":
      return `${prefix}Prompt video mock: plan court, mouvement simple, intention visible. Sujet: ${request.prompt.trim()}`;
    case "video.storyboard":
      return `${prefix}Storyboard mock:\nPlan 1: accroche visuelle.\nPlan 2: demonstration.\nPlan 3: conclusion.`;
    case "translation":
      return `${prefix}Traduction mock a valider humainement: ${request.prompt.trim()}`;
    case "metadata.tags":
      return createTags(request.prompt);
  }
}

function createTags(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 8);

  return [...new Set(words)].map((word) => `#${word}`).join(", ") || "#publisher, #mock";
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
