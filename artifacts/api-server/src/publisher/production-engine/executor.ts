import { validateProductionArtifact } from "./artifact-validator";
import type {
  ExecutionReport,
  ProducerRegistry,
  ProductionArtifact,
  ProductionObservation,
  ProductionPlan,
  ProductionRequest,
} from "./producer-registry";

export class Executor {
  constructor(private readonly registry: ProducerRegistry) {}

  async execute(plan: ProductionPlan, request: ProductionRequest): Promise<ExecutionReport> {
    const artifacts: ProductionArtifact[] = [];
    const errors: ExecutionReport["errors"] = [];
    const observations: ProductionObservation[] = [];
    const observe = (stepId: string, producerId: string, reasonCodes: string[], outcome: ProductionObservation["outcome"]): void => {
      observations.push({ requestId: request.id, stepId, producerId, capability: request.capability,
        outcome, reasonCodes, observedAt: new Date().toISOString(), source: "publisher-production-engine" });
    };

    for (const step of plan.steps) {
      if (step.status !== "ready" || !step.producerId) continue;
      const producer = this.registry.get(step.producerId);
      if (!producer?.execute) {
        errors.push({
          stepId: step.id,
          producerId: step.producerId,
          message: "Producer has no executor in Production Engine V1.",
        });
        observe(step.id, step.producerId, ["executor-missing"], "execution-failed");
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
          observe(step.id, producer.id, validationErrors.map(toReasonCode), "artifact-rejected");
          continue;
        }
        artifacts.push(artifact);
        observe(step.id, producer.id, [], "artifact-validated");
      } catch (error) {
        errors.push({
          stepId: step.id,
          producerId: step.producerId,
          message: error instanceof Error ? error.message : "Producer execution failed.",
        });
        observe(step.id, step.producerId, ["executor-threw"], "execution-failed");
      }
    }

    return {
      planId: plan.id,
      status: errors.length === 0 ? "completed" : artifacts.length > 0 ? "partial" : "failed",
      artifacts,
      observations,
      errors,
    };
  }
}

/** Keep reason codes deliberately coarse: do not leak inputs or provider errors. */
function toReasonCode(message: string): string {
  if (message.includes("requestId")) return "request-mismatch";
  if (message.includes("stepId")) return "step-mismatch";
  if (message.includes("producerId")) return "producer-mismatch";
  if (message.includes("capability")) return "capability-mismatch";
  if (message.includes("identity")) return "identity-missing";
  if (message.includes("no usable content")) return "artifact-empty";
  if (message.includes("HTTPS")) return "url-insecure";
  if (message.includes("viewport")) return "viewport-missing";
  if (message.includes("HTML")) return "html-invalid";
  return "validation-failed";
}
