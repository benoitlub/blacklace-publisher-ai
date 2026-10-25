import type {
  Producer,
  ProducerCapability,
  ProducerRegistry,
  ProductionCost,
  ProductionPlan,
  ProductionQuality,
  ProductionRequest,
  ProductionStep,
} from "./producer-registry";

const COST_SCORE: Record<ProductionCost, number> = {
  none: 40,
  low: 30,
  medium: 15,
  high: 5,
  unknown: 0,
};

const QUALITY_SCORE: Record<ProductionQuality, number> = {
  basic: 5,
  standard: 15,
  high: 25,
};

export class Planner {
  constructor(private readonly registry: ProducerRegistry) {}

  plan(request: ProductionRequest): ProductionPlan {
    const producers = this.registry.byCapability(request.capability);
    if (producers.length === 0) {
      return this.unsupportedPlan(request, "No producer registered for this capability.");
    }

    // A registered provider is not necessarily executable.
    const compatible = producers
      .filter((producer) => isUsable(producer) && Boolean(producer.execute) && meetsConstraints(producer, request))
      .sort((a, b) => this.score(b, request) - this.score(a, request));

    const selected = compatible[0] ?? null;
    if (!selected) {
      return this.blockedPlan(request, producers, "No executable, authorized producer satisfies the cost and quality constraints.");
    }

    return {
      id: `production-plan-${request.id}`,
      requestId: request.id,
      capability: request.capability,
      createdAt: new Date().toISOString(),
      status: "ready",
      steps: [this.readyStep(request.capability, selected, producers)],
    };
  }

  private score(producer: Producer, request: ProductionRequest): number {
    const statusScore = producer.status === "available" || producer.status === "authorized" ? 100 : producer.status === "not-configured" ? 10 : 0;
    const fallbackScore = producer.alternatives.length > 0 ? 4 : 0;
    const preferredScore = request.preferredProducerId === producer.id ? 50 : 0;
    return statusScore + COST_SCORE[producer.cost] + QUALITY_SCORE[producer.quality] + fallbackScore + preferredScore;
  }

  private readyStep(capability: ProducerCapability, producer: Producer, allProducers: Producer[]): ProductionStep {
    return {
      id: `${capability}-${producer.id}`,
      capability,
      producerId: producer.id,
      producerLabel: producer.label,
      status: "ready",
      cost: producer.cost,
      quality: producer.quality,
      connector: producer.connector,
      alternatives: unique([...producer.alternatives, ...allProducers.filter((item) => item.id !== producer.id).map((item) => item.id)]),
      reason: `${producer.label} is the best available executable producer for ${capability}.`,
    };
  }

  private blockedPlan(request: ProductionRequest, producers: Producer[], reason: string): ProductionPlan {
    return {
      id: `production-plan-${request.id}`,
      requestId: request.id,
      capability: request.capability,
      createdAt: new Date().toISOString(),
      status: "blocked",
      steps: [{
        id: `${request.capability}-blocked`,
        capability: request.capability,
        producerId: null,
        producerLabel: null,
        status: "blocked",
        cost: null,
        quality: null,
        connector: null,
        alternatives: producers.map((producer) => producer.id),
        reason,
      }],
    };
  }

  private unsupportedPlan(request: ProductionRequest, reason: string): ProductionPlan {
    return {
      id: `production-plan-${request.id}`,
      requestId: request.id,
      capability: request.capability,
      createdAt: new Date().toISOString(),
      status: "unsupported",
      steps: [{
        id: `${request.capability}-unsupported`,
        capability: request.capability,
        producerId: null,
        producerLabel: null,
        status: "unsupported",
        cost: null,
        quality: null,
        connector: null,
        alternatives: [],
        reason,
      }],
    };
  }
}

function isUsable(producer: Producer): boolean {
  return producer.status === "available" || producer.status === "authorized";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

const COST_ORDER: ProductionCost[] = ["none", "low", "medium", "high"];
const QUALITY_ORDER: ProductionQuality[] = ["basic", "standard", "high"];

function meetsConstraints(producer: Producer, request: ProductionRequest): boolean {
  const { maxCost, minQuality } = request.constraints ?? {};
  if (maxCost && maxCost !== "unknown") {
    const maxIndex = COST_ORDER.indexOf(maxCost);
    const producerIndex = COST_ORDER.indexOf(producer.cost);
    if (producerIndex < 0 || producerIndex > maxIndex) return false;
  }
  if (minQuality) {
    const minimum = QUALITY_ORDER.indexOf(minQuality);
    if (minimum >= 0 && QUALITY_ORDER.indexOf(producer.quality) < minimum) return false;
  }
  return true;
}
