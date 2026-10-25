import { validateProductionArtifact } from "./artifact-validator";
import type {
  ExecutionReport,
  ProducerRegistry,
  ProductionArtifact,
  ProductionPlan,
  ProductionRequest,
} from "./producer-registry";

export class Executor {
  constructor(private readonly registry: ProducerRegistry) {}

  async execute(plan: ProductionPlan, request: ProductionRequest): Promise<ExecutionReport> {
    const artifacts: ProductionArtifact[] = [];
    const errors: ExecutionReport["errors"] = [];

    for (const step of plan.steps) {
      if (step.status !== "ready" || !step.producerId) continue;
      const producer = this.registry.get(step.producerId);
      if (!producer?.execute) {
        errors.push({
          stepId: step.id,
          producerId: step.producerId,
          message: "Producer has no executor in Production Engine V1.",
        });
        continue;
      }

      try {
        const artifact = await producer.execute(request, step.id);
        const validationErrors = validateProductionArtifact(artifact, request, producer.id, step.id);
        if (validationErrors.length > 0) {
          errors.push({
            stepId: step.id,
            producerId: producer.id,
            message: `Artifact rejected by quality gate: ${validationErrors.join(" ")}`,
          });
          continue;
        }
        artifacts.push(artifact);
      } catch (error) {
        errors.push({
          stepId: step.id,
          producerId: step.producerId,
          message: error instanceof Error ? error.message : "Producer execution failed.",
        });
      }
    }

    return {
      planId: plan.id,
      status: errors.length === 0 ? "completed" : artifacts.length > 0 ? "partial" : "failed",
      artifacts,
      errors,
    };
  }
}
