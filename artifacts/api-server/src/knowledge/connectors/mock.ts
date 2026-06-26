import type { KnowledgeConnector, KnowledgeDocument, KnowledgeSearchResult, KnowledgeSyncResult } from "../types";

export const MOCK_KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: "blacklace-mock-1",
    title: "Blacklace demo pack",
    source: "mock:blacklace-pack",
    universe: "Blacklace",
    content: "Demo knowledge for the Blacklace universe. Replace this mock source with Notion, Markdown, GitHub or a client connector.",
    tags: ["demo", "universe", "blacklace"],
    isMock: true,
  },
  {
    id: "blacklace-mock-2",
    title: "Creature Sync demo",
    source: "mock:blacklace-pack",
    universe: "Creature-Sync",
    content: "Demo knowledge for a nature observation project connected to an editorial engine.",
    tags: ["demo", "nature", "creature-sync"],
    isMock: true,
  },
  {
    id: "blacklace-mock-3",
    title: "Author project demo",
    source: "mock:author-pack",
    universe: "Author Pack",
    content: "Demo knowledge for authors who want to promote books, chapters and fictional worlds.",
    tags: ["demo", "author", "books"],
    isMock: true,
  },
];

function scoreDocument(document: KnowledgeDocument, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 1;

  const haystack = [document.title, document.universe, document.content, ...document.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return normalizedQuery
    .split(/\s+/)
    .filter((term) => haystack.includes(term)).length;
}

export class MockKnowledgeConnector implements KnowledgeConnector {
  readonly name = "mock";

  async sync(): Promise<KnowledgeSyncResult> {
    return {
      connector: this.name,
      documentsSynced: MOCK_KNOWLEDGE_DOCUMENTS.length,
      isMock: true,
      warnings: ["Mock knowledge connector active. Configure KNOWLEDGE_CONNECTOR for real data."],
    };
  }

  async search(query: string): Promise<KnowledgeSearchResult[]> {
    return MOCK_KNOWLEDGE_DOCUMENTS
      .map((document) => ({ ...document, score: scoreDocument(document, query) }))
      .filter((document) => !query.trim() || (document.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  async getDocument(id: string): Promise<KnowledgeDocument | null> {
    return MOCK_KNOWLEDGE_DOCUMENTS.find((document) => document.id === id) ?? null;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}
