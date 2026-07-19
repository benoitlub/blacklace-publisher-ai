import { beforeEach, describe, expect, it, vi } from "vitest";

const notion = vi.hoisted(() => ({
  diagnostics: {
    connected: true,
    source: "notion" as const,
    title: "Knowledge Packages",
    charCount: 0,
    sectionCount: 0,
    error: null as string | null,
    items: [] as Array<{
      id: string;
      title: string;
      universe: string;
      content: string;
      tags: string[];
      isMock: boolean;
    }>,
  } as {
    connected: boolean;
    source: "notion" | "mock";
    title: string;
    charCount: number;
    sectionCount: number;
    error: string | null;
    items: Array<{
      id: string;
      title: string;
      universe: string;
      content: string;
      tags: string[];
      isMock: boolean;
    }>;
  },
}));

vi.mock("../notion", () => ({
  fetchBlacklaceKnowledgeWithDiagnostics: async () => notion.diagnostics,
}));

describe("resolveKnowledgePackage", () => {
  beforeEach(() => {
    notion.diagnostics = {
      connected: true,
      source: "notion",
      title: "Knowledge Packages",
      charCount: 0,
      sectionCount: 0,
      error: null,
      items: [],
    };
  });

  it("keeps word separators so multi-word client packages match Notion facts", async () => {
    const { normalizeKnowledgeSlug, resolveKnowledgePackage } = await import("../knowledge-package-resolver");
    notion.diagnostics.items = [
      {
        id: "yael-1",
        title: "Yael Bali",
        universe: "Client",
        content: "Yael Bali est courtière en prêts immobiliers et recherche les meilleurs taux.",
        tags: ["Yael Bali", "client"],
        isMock: false,
      },
    ];

    expect(normalizeKnowledgeSlug("Yael Bali")).toBe("yael-bali");

    const result = await resolveKnowledgePackage(["Yael Bali"]);

    expect(result.verified).toBe(true);
    expect(result.slug).toBe("yael-bali");
    expect(result.items).toHaveLength(1);
    expect(result.prompt).toContain("courtière en prêts immobiliers");
  });

  it("resolves known multi-word product aliases without collapsing them", async () => {
    const { resolveKnowledgePackage } = await import("../knowledge-package-resolver");
    notion.diagnostics.items = [
      {
        id: "prohibited-1",
        title: "Pro.Hibited Online",
        universe: "Pro.Hibited",
        content: "Pro.Hibited Online est un espace éditorial vérifié.",
        tags: ["pro hibited"],
        isMock: false,
      },
    ];

    const result = await resolveKnowledgePackage(["Pro.Hibited Online"]);

    expect(result.verified).toBe(true);
    expect(result.slug).toBe("pro-hibited-online");
    expect(result.items[0]?.title).toBe("Pro.Hibited Online");
  });

  it("refuses mock knowledge even when a mock item matches the requested package", async () => {
    const { resolveKnowledgePackage } = await import("../knowledge-package-resolver");
    notion.diagnostics = {
      ...notion.diagnostics,
      connected: false,
      source: "mock",
      items: [
        {
          id: "mock-yael",
          title: "Yael Bali",
          universe: "Client",
          content: "Contexte simulé.",
          tags: ["yael bali"],
          isMock: true,
        },
      ],
    };

    const result = await resolveKnowledgePackage(["Yael Bali"]);

    expect(result.verified).toBe(false);
    expect(result.source).toBe("mock");
    expect(result.prompt).toBe("");
    expect(result.missingFacts).toContain("verified-client-or-product-context");
  });
});
