import { Executor } from "./executor";
import { Planner } from "./planner";
import {
  createDefaultProducerRegistry,
  type ExecutionReport,
  type Producer,
  type ProducerCapability,
  ProducerRegistry,
  type ProductionArtifact,
  type ProductionPlan,
  type ProductionRequest,
  type ProductionStep,
} from "./producer-registry";

export class ProductionEngine {
  private readonly planner: Planner;
  private readonly executor: Executor;

  constructor(private readonly registry: ProducerRegistry = createDefaultProducerRegistry()) {
    this.planner = new Planner(registry);
    this.executor = new Executor(registry);
  }

  plan(request: ProductionRequest): ProductionPlan {
    return this.planner.plan(request);
  }

  execute(plan: ProductionPlan, request: ProductionRequest): Promise<ExecutionReport> {
    return this.executor.execute(plan, request);
  }
}

export const productionEngine = new ProductionEngine();

export type {
  ExecutionReport,
  Producer,
  ProducerCapability,
  ProductionArtifact,
  ProductionPlan,
  ProductionRequest,
  ProductionStep,
};

export { createDefaultProducerRegistry, ProducerRegistry, HtmlLocalProducer } from "./producer-registry";
