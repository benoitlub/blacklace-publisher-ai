import { writeGlobalState } from "../services/global-state";
import type { ProducedDeliverable } from "./adapter";
import type { ProductionRequest } from "./producer";

export interface DeliverableRecord {
  id: string;
  parcelId: string;
  parcelName: string;
  knowledgePackageVersion: number;
  kind: ProductionRequest["deliverableKind"];
  filename: string;
  mediaType: ProducedDeliverable["mediaType"];
  content: string;
  createdAt: string;
}

export async function registerDeliverable(
  request: ProductionRequest,
  deliverable: ProducedDeliverable,
): Promise<DeliverableRecord> {
  const record: DeliverableRecord = {
    id: `deliverable:${request.parcelId}:${Date.now()}`,
    parcelId: request.parcelId,
    parcelName: request.parcelName,
    knowledgePackageVersion: request.knowledgePackageVersion,
    kind: request.deliverableKind,
    filename: deliverable.filename,
    mediaType: deliverable.mediaType,
    content: deliverable.content,
    createdAt: new Date().toISOString(),
  };
  await writeGlobalState("deliverables", record.id, record);
  return record;
}
