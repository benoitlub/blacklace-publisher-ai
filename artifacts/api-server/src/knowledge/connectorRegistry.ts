import type { KnowledgeConnector } from "./types";
import { MockKnowledgeConnector } from "./connectors/mock";

let instance: KnowledgeConnector | null = null;

function buildConnector(): KnowledgeConnector {
  return new MockKnowledgeConnector();
}

export function getKnowledgeConnector(): KnowledgeConnector {
  if (!instance) {
    instance = buildConnector();
  }
  return instance;
}

export function resetKnowledgeConnector(): void {
  instance = null;
}
