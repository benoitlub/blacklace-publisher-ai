export interface KnowledgeDocument {
  id: string;
  title: string;
  source: string;
  universe?: string;
  content: string;
  tags: string[];
  isMock: boolean;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface KnowledgeSearchResult extends KnowledgeDocument {
  score?: number;
}

export interface KnowledgeSyncResult {
  connector: string;
  documentsSynced: number;
  isMock: boolean;
  warnings: string[];
}

export interface KnowledgeConnector {
  readonly name: string;
  sync(): Promise<KnowledgeSyncResult>;
  search(query: string): Promise<KnowledgeSearchResult[]>;
  getDocument(id: string): Promise<KnowledgeDocument | null>;
  healthCheck(): Promise<boolean>;
}
