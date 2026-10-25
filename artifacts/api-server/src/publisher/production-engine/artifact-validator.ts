import type { ProductionArtifact, ProductionRequest } from "./producer-registry";

/** Structural quality gate. This does not claim to judge editorial or visual quality. */
export function validateProductionArtifact(
  artifact: ProductionArtifact,
  request: ProductionRequest,
  expectedProducerId: string,
  expectedStepId: string,
): string[] {
  const errors: string[] = [];
  if (!artifact || typeof artifact !== "object") return ["Producer returned no artifact."];
  if (artifact.requestId !== request.id) errors.push("Artifact requestId does not match the request.");
  if (artifact.stepId !== expectedStepId) errors.push("Artifact stepId does not match the executed step.");
  if (artifact.producerId !== expectedProducerId) errors.push("Artifact producerId does not match the executor.");
  if (artifact.capability !== request.capability) errors.push("Artifact capability does not match the request.");
  if (!artifact.id?.trim() || !artifact.title?.trim() || !artifact.type?.trim()) {
    errors.push("Artifact identity, title or type is missing.");
  }
  const content = typeof artifact.content === "string" ? artifact.content.trim() : "";
  const url = typeof artifact.url === "string" ? artifact.url.trim() : "";
  const downloadUrl = typeof artifact.downloadUrl === "string" ? artifact.downloadUrl.trim() : "";
  if (!content && !url && !downloadUrl) errors.push("Artifact has no usable content or URL.");
  for (const value of [url, downloadUrl].filter(Boolean)) {
    if (!/^https:\/\//i.test(value)) errors.push("Artifact URL must use HTTPS.");
  }
  if (request.capability === "landing-page" && artifact.type === "landing-page.html") {
    if (!/<!doctype html>/i.test(content) || !/<main[\s>]/i.test(content)) {
      errors.push("Landing page is missing a valid HTML document and main region.");
    }
    if (!/<meta\s+name=["']viewport["']/i.test(content)) {
      errors.push("Landing page is missing its viewport metadata.");
    }
  }
  return errors;
}
