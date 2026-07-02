import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importNotionModule() {
  vi.resetModules();
  return import("../notion");
}

describe("fetchBlacklaceKnowledgeWithDiagnostics", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NOTION_API_KEY;
    delete process.env.NOTION_DATABASE_ID;
    delete process.env.NOTION_PAGE_ID;
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("falls back to mock knowledge when no Notion env vars are configured", async () => {
    const { fetchBlacklaceKnowledgeWithDiagnostics } = await importNotionModule();

    const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();

    expect(diagnostics.connected).toBe(false);
    expect(diagnostics.source).toBe("mock");
    expect(diagnostics.error).toContain("NOTION_API_KEY");
    expect(diagnostics.items.length).toBeGreaterThan(0);
    expect(diagnostics.title).toBeTruthy();
    expect(diagnostics.sectionCount).toBe(diagnostics.items.length);
  });

  it("falls back to mock knowledge and reports the reason when NOTION_API_KEY is set without a database or page id", async () => {
    process.env.NOTION_API_KEY = "secret_test_key";

    const { fetchBlacklaceKnowledgeWithDiagnostics } = await importNotionModule();
    const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();

    expect(diagnostics.connected).toBe(false);
    expect(diagnostics.source).toBe("mock");
    expect(diagnostics.error).toContain("NOTION_DATABASE_ID");
  });

  it("connects to a Notion database when NOTION_DATABASE_ID is configured and the API responds successfully", async () => {
    process.env.NOTION_API_KEY = "secret_test_key";
    process.env.NOTION_DATABASE_ID = "db-123";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            {
              id: "page-1",
              properties: {
                Name: { title: [{ plain_text: "Article de test" }] },
                Universe: { select: { name: "Blacklace" } },
                Content: { rich_text: [{ plain_text: "Contenu réel de Notion" }] },
                Tags: { multi_select: [{ name: "test" }] },
              },
            },
          ],
        }),
      })),
    );

    const { fetchBlacklaceKnowledgeWithDiagnostics } = await importNotionModule();
    const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();

    expect(diagnostics.connected).toBe(true);
    expect(diagnostics.source).toBe("notion");
    expect(diagnostics.error).toBeNull();
    expect(diagnostics.items).toHaveLength(1);
    expect(diagnostics.items[0].title).toBe("Article de test");
    expect(diagnostics.items[0].isMock).toBe(false);
  });

  it("falls back to mock knowledge with a readable error when the Notion API call fails, without throwing", async () => {
    process.env.NOTION_API_KEY = "secret_test_key";
    process.env.NOTION_PAGE_ID = "page-456";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({}),
      })),
    );

    const { fetchBlacklaceKnowledgeWithDiagnostics } = await importNotionModule();

    await expect(fetchBlacklaceKnowledgeWithDiagnostics()).resolves.toMatchObject({
      connected: false,
      source: "mock",
    });

    const diagnostics = await fetchBlacklaceKnowledgeWithDiagnostics();
    expect(diagnostics.error).toContain("401");
    expect(diagnostics.items.length).toBeGreaterThan(0);
  });
});

describe("buildKnowledgeContext", () => {
  it("filters knowledge items by universe and falls back to all items when none match", async () => {
    const { buildKnowledgeContext } = await importNotionModule();

    const items = [
      { id: "1", title: "A", universe: "Blacklace", content: "contenu A", tags: [], isMock: true },
      { id: "2", title: "B", universe: "TERRA", content: "contenu B", tags: [], isMock: true },
    ];

    const blacklaceContext = buildKnowledgeContext(items, "Blacklace");
    expect(blacklaceContext).toContain("contenu A");
    expect(blacklaceContext).not.toContain("contenu B");

    const unknownUniverseContext = buildKnowledgeContext(items, "Univers Inconnu");
    expect(unknownUniverseContext).toContain("contenu A");
    expect(unknownUniverseContext).toContain("contenu B");
  });
});
