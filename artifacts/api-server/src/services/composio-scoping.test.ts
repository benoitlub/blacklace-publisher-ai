import { it, expect, vi, afterEach } from "vitest";
import { listComposioConnectedAccounts } from "./composio";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("paginates only the requested user and excludes explicit foreign connections", async () => {
  vi.stubEnv("COMPOSIO_API_KEY", "simulated-key");
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    return Response.json(
      url.includes("cursor=")
        ? {
            items: [
              {
                id: "mine",
                toolkit: { slug: "canva" },
                status: "ACTIVE",
                user_id: "gerard",
              },
              {
                id: "other",
                toolkit: { slug: "canva" },
                status: "ACTIVE",
                user_id: "another-user",
              },
            ],
          }
        : { items: [], next_cursor: "next" },
    );
  });
  const accounts = await listComposioConnectedAccounts("gerard");
  expect(accounts.map((a) => a.id)).toEqual(["mine"]);
  expect(urls).toHaveLength(2);
  expect(urls.every((u) => u.includes("user_ids=gerard"))).toBe(true);
});
it("empty accounts or quota errors never widen discovery to the entire Composio project", async () => {
  vi.stubEnv("COMPOSIO_API_KEY", "simulated-key");
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ items: [] }));
  expect(await listComposioConnectedAccounts("gerard")).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher
    .mockReset()
    .mockResolvedValue(
      Response.json({ message: "rate-limited" }, { status: 429 }),
    );
  await expect(listComposioConnectedAccounts("gerard")).rejects.toMatchObject({
    status: 429,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
