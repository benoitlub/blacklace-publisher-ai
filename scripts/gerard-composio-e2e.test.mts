import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import workerModule from "../publisher-worker/src/worker.ts";
const worker = "fetch" in workerModule ? workerModule : workerModule.default;

test(
  "Gérard cultivate -> current Octopus -> Express -> Worker -> dynamic Composio -> honest result",
  { timeout: 120000 },
  async (t) => {
    const enginePath =
      process.env.OCTOPUS_APP_PATH ??
      new URL(
        "../artifacts/api-server/node_modules/octopus-engine/dist/app.js",
        import.meta.url,
      ).pathname;
    const { app: octopus } = await import(pathToFileURL(enginePath).href);
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      PUBLISHER_URL: process.env.PUBLISHER_URL,
    };
    const env = {
      DATABASE_URL:
        "postgresql://simulation:simulation@simulation.invalid/simulation",
      COMPOSIO_API_KEY: "simulated-project-key",
      COMPOSIO_USER_ID: "gerard",
    };
    process.env.DATABASE_URL = env.DATABASE_URL;
    process.env.PUBLISHER_URL = "https://worker.test";
    t.after(() => {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    let api: any,
      mode = "success",
      executions = 0;
    const states = new Map<string, any>(),
      trace: string[] = [],
      missions: any[] = [];
    const responseSQL = (rows: any[]) => {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      return Response.json({
        fields: cols.map((name) => ({
          name,
          dataTypeID: name === "value" ? 3802 : 25,
        })),
        rows: rows.map((r) =>
          cols.map((c) => (c === "value" ? JSON.stringify(r[c]) : r[c])),
        ),
        rowCount: rows.length,
      });
    };
    const server = createServer(async (req, res) => {
      try {
        let raw = "";
        for await (const c of req) raw += c;
        const body = JSON.parse(raw);
        let response: Response;
        if (req.url === "/mission") {
          missions.push(body);
          response = await octopus.request("/mission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: raw,
          });
        } else if (req.url === "/api/octopus-adapter/execute")
          response = Response.json(await api.executePublisherAdapter(body));
        else throw new Error("Unexpected local endpoint");
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json");
        res.end(await response.text());
      } catch {
        res.statusCode = 500;
        res.end('{"status":"failed"}');
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const nativeFetch = fetch;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init),
          url = new URL(req.url);
        if (url.origin === base) return nativeFetch(req);
        if (url.origin === "https://worker.test") {
          trace.push("express->worker");
          return worker.fetch(req, env);
        }
        if (url.href === "https://api.invalid/sql") {
          const { query, params } = (await req.json()) as any;
          if (/CREATE (TABLE|INDEX)/.test(query)) return responseSQL([]);
          if (/SELECT value FROM publisher_global_state/.test(query))
            return responseSQL(
              states.has(params[0]) ? [{ value: states.get(params[0]) }] : [],
            );
          if (/INSERT INTO publisher_global_state/.test(query)) {
            if (states.has(params[0])) return responseSQL([]);
            states.set(params[0], JSON.parse(params[1]));
            return responseSQL([{ version: 1 }]);
          }
          if (/UPDATE publisher_global_state SET value/.test(query)) {
            if (states.get(params[1])?.fingerprint !== params[2])
              return responseSQL([]);
            states.set(params[1], JSON.parse(params[0]));
            return responseSQL([{ version: 2 }]);
          }
          throw new Error("Unexpected SQL");
        }
        if (url.origin === "https://backend.composio.dev") {
          assert.equal(req.headers.get("x-api-key"), env.COMPOSIO_API_KEY);
          if (url.pathname.endsWith("/connected_accounts")) {
            assert.equal(url.searchParams.get("user_ids"), "gerard");
            trace.push("scoped-accounts");
            if (mode === "rate")
              return Response.json(
                { message: "quota" },
                { status: 429, headers: { "Retry-After": "120" } },
              );
            return Response.json({
              items:
                mode === "missing"
                  ? []
                  : [
                      {
                        id: "scoped-search",
                        toolkit: { slug: "composio_search" },
                        status: "ACTIVE",
                        user_id: "gerard",
                      },
                    ],
            });
          }
          const toolkit =
            mode === "missing" ? "unconnected-search" : "composio_search";
          const metadata = {
            slug: "DISCOVERED_WEB_SEARCH_114",
            name: "Web search",
            toolkit: { slug: toolkit },
          };
          if (url.pathname.endsWith("/tools")) {
            trace.push("dynamic-tools");
            return Response.json({ items: [metadata] });
          }
          if (url.pathname.endsWith("/tools/DISCOVERED_WEB_SEARCH_114")) {
            trace.push("tool-schema");
            return Response.json({
              ...metadata,
              input_parameters: {
                type: "object",
                required: ["query"],
                additionalProperties: false,
                properties: { query: { type: "string", maxLength: 1200 } },
              },
            });
          }
          if (url.pathname.endsWith("/execute/DISCOVERED_WEB_SEARCH_114")) {
            executions++;
            trace.push("execute-discovered-tool");
            assert.equal(states.size > 0, true);
            const body = (await req.json()) as any;
            assert.equal(body.connected_account_id, "scoped-search");
            assert.equal(body.user_id, "gerard");
            assert.deepEqual(Object.keys(body.arguments), ["query"]);
            return Response.json(
              mode === "provider-error"
                ? { successful: false, error: "fixture-provider-error" }
                : {
                    successful: true,
                    data: {
                      citations:
                        mode === "empty"
                          ? []
                          : [
                              {
                                title: "Entreprise fixture — ne pas prospecter",
                                id: "https://fixture.example.org/contact",
                                snippet: "Source simulée, non qualifiée",
                              },
                            ],
                    },
                  },
            );
          }
        }
        throw new Error(
          `No real/unplanned network allowed: ${url.origin}${url.pathname}`,
        );
      },
    );
    api =
      await import("../artifacts/api-server/src/publisher/octopus-adapter.ts");
    const registered = await octopus.request("/adapters/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "publisher",
        name: "Publisher",
        capabilities: api.PUBLISHER_ADAPTER_CAPABILITIES,
        executeUrl: base + "/api/octopus-adapter/execute",
      }),
    });
    assert.equal(registered.status, 201);
    const mission = (
      id: string,
      capability = "business.sources.search",
      dryRun = false,
    ) => ({
      operationId: id,
      title: "Sources B2B",
      objective: "Trouver des distributeurs sourcés",
      prompt: "Distributeurs B2B Pro.Hibited Europe",
      requiredCapabilities: [capability],
      authorizedResources: dryRun ? [] : ["tools.read"],
      context: {
        id: "benoit-business-growth",
        metadata: { toolRequest: { dryRun } },
      },
    });
    const submit = async (m: any) =>
      (await (
        await fetch(base + "/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(m),
        })
      ).json()) as any;
    const discovered = await submit(
      mission("discover-114", "tool.search", true),
    );
    assert.equal(discovered.status, "completed");
    assert.equal(discovered.output.executed, false);
    assert.equal(executions, 0);
    const preview = await submit(
      mission("preview-114", "business.sources.search", true),
    );
    assert.equal(preview.output.status, "ready-to-read");
    assert.equal(preview.output.executed, false);
    assert.equal(executions, 0);
    const outcomes: any[] = [];
    for (const scenario of [
      "success",
      "missing",
      "rate",
      "provider-error",
      "empty",
    ]) {
      mode = scenario;
      let result: any;
      if (process.env.GERARD_CYCLE_PATH) {
        const root = await mkdtemp(path.join(tmpdir(), "gerard-composio-e2e-"));
        try {
          await mkdir(path.join(root, "scripts"));
          await mkdir(path.join(root, "garden"));
          for (const file of ["gerard-cycle.mjs", "gerard-compost.mjs"])
            await copyFile(
              path.join(path.dirname(process.env.GERARD_CYCLE_PATH), file),
              path.join(root, "scripts", file),
            );
          await writeFile(
            path.join(root, "garden/restart-seeds.json"),
            JSON.stringify({
              seeds: [
                {
                  seedId: "benoit-client-acquisition",
                  parcelId: "benoit-business-growth",
                  title: "B2B fixture",
                  objective: "Distributeurs publics B2B",
                  knowledgeSlug: "not-required-for-b2b",
                  delivery: { harvestState: "ready-to-offer" },
                },
              ],
            }),
          );
          await writeFile(
            path.join(root, "garden/harvests.json"),
            '{"harvests":[]}',
          );
          await writeFile(path.join(root, "garden/gerard-state.json"), "{}");
          let exit = 0;
          try {
            await promisify(execFile)(
              process.execPath,
              [path.join(root, "scripts/gerard-cycle.mjs")],
              {
                cwd: root,
                env: {
                  ...process.env,
                  OCTOPUS_URL: base,
                  PUBLISHER_URL: "https://worker.test",
                  GERARD_MODE: "cultivate",
                },
                timeout: 30000,
              },
            );
          } catch (e) {
            exit = Number((e as any).code);
          }
          const state = JSON.parse(
            await readFile(path.join(root, "garden/gerard-state.json"), "utf8"),
          );
          const harvests = JSON.parse(
            await readFile(path.join(root, "garden/harvests.json"), "utf8"),
          ).harvests;
          assert.equal(exit, scenario === "success" ? 0 : 1);
          assert.equal(
            harvests.length,
            scenario === "success" ? 1 : 0,
            JSON.stringify(state.lastResult),
          );
          result = state.lastResult.businessSourceLookup;
          if (scenario === "success") {
            assert.equal(harvests[0].verification.qualifiedProspects, 0);
            assert.equal(harvests[0].state, "harvested");
            assert.equal(state.lastResult.knowledge.verified, false);
          }
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      } else {
        const response = await submit(mission(`fixture-${scenario}-114`));
        result = response.output;
        assert.equal(
          response.status,
          scenario === "success" || scenario === "empty"
            ? "completed"
            : "waiting-authorization",
        );
      }
      assert.equal(
        result.status,
        scenario === "success"
          ? "sources-found"
          : scenario === "empty"
            ? "no-sources"
            : scenario === "provider-error"
              ? "confirmation-required"
              : "blocked",
      );
      outcomes.push({
        scenario,
        status: result.status,
        reason: result.reason ?? null,
        realVerifiedProspects: 0,
      });
    }
    assert.ok(
      missions.every(
        (m) =>
          !["copy.generate", "knowledge.search", "social.publish"].some((c) =>
            m.requiredCapabilities.includes(c),
          ),
      ),
    );
    mode = "success";
    const stable = mission("durable-idempotence-114");
    const envelope = {
      contract: "octopus-adapter-execution-v1",
      adapterId: "publisher",
      mission: stable,
    };
    await api.executePublisherAdapter(envelope);
    const count = executions;
    const repeat = await api.executePublisherAdapter(envelope);
    assert.equal(repeat.output.replayed, true);
    assert.equal(executions, count);
    const proof = {
      proof: "gerard-cultivate-octopus-express-worker-composio",
      gerardClient: process.env.GERARD_CYCLE_PATH
        ? "actual-cycle-script"
        : "versioned-business-mission-fixtures",
      octopusApp: process.env.OCTOPUS_APP_PATH
        ? "current-repository-build"
        : "existing-pinned-dependency",
      externalProviderNetwork: "fully-simulated",
      realExternalExecutions: 0,
      realVerifiedProspects: 0,
      realContacts: 0,
      realOrders: 0,
      simulatedToolExecutions: executions,
      repeatedRequestExecutions: 0,
      outcomes,
      trace,
    };
    if (process.env.COMPOSIO_PROOF_PATH)
      await writeFile(
        process.env.COMPOSIO_PROOF_PATH,
        JSON.stringify(proof, null, 2) + "\n",
      );
    console.log(JSON.stringify(proof));
  },
);
