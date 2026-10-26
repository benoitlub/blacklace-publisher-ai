import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  copyFile,
  readdir,
  cp,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import express from "../artifacts/api-server/node_modules/express/index.js";
import {
  artifactPath,
  hash,
} from "../artifacts/api-server/src/publisher/studio/runtime.ts";

test(
  "real Gerard client -> Octopus -> Publisher -> Piper/FFmpeg -> downloaded verified MP4; zero external execution",
  { skip: process.env.RUN_STUDIO_E2E !== "true", timeout: 240000 },
  async (t) => {
    assert.ok(
      process.env.GERARD_STUDIO_CLIENT,
      "Provide the companion Poulpe client path",
    );
    assert.ok(
      process.env.OCTOPUS_APP_PATH,
      "Provide the existing compiled Octopus app",
    );
    const root = await mkdtemp(path.join(tmpdir(), "studio-e2e-"));
    const old = {
      DATABASE_URL: process.env.DATABASE_URL,
      PUBLISHER_STUDIO_DIR: process.env.PUBLISHER_STUDIO_DIR,
    };
    process.env.DATABASE_URL =
      "postgresql://simulation:simulation@simulation.invalid/simulation";
    process.env.PUBLISHER_STUDIO_DIR = path.join(root, "publisher");
    t.after(async () => {
      for (const [k, v] of Object.entries(old)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await rm(root, { recursive: true, force: true });
    });
    const { app: octopus } = await import(
      pathToFileURL(process.env.OCTOPUS_APP_PATH).href
    );
    const { default: adapterRouter } =
      await import("../artifacts/api-server/src/routes/octopus-adapter.ts");
    const { default: studioRouter } =
      await import("../artifacts/api-server/src/routes/studio.ts");
    const { runParcelStudio, studioOperationId } = await import(
      pathToFileURL(process.env.GERARD_STUDIO_CLIENT).href
    );
    let missions = 0,
      adapterExecutions = 0,
      externalCalls = 0;
    const api = express();
    api.use(express.json());
    api.use(
      "/api/octopus-adapter",
      (_req: any, _res: any, next: any) => {
        adapterExecutions++;
        next();
      },
      adapterRouter,
    );
    api.use("/api/production/studio", studioRouter);
    api.post("/mission", async (req: any, res: any) => {
      missions++;
      const response = await octopus.request("/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      res.status(response.status).send(await response.text());
    });
    const server = createServer(api);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const nativeFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", async (input, init) => {
      if (!new URL(String(input)).href.startsWith(base + "/")) {
        externalCalls++;
        throw new Error(
          "External network forbidden in zero-cost audiovisual proof",
        );
      }
      return nativeFetch(input, init);
    });
    const registration = await octopus.request("/adapters/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "publisher",
        name: "Publisher",
        version: "studio-e2e",
        capabilities: ["video.studio"],
        executeUrl: base + "/api/octopus-adapter/execute",
      }),
    });
    assert.equal(registration.status, 201);
    const denied = await fetch(base + "/api/production/studio/catalog", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    assert.equal(denied.status, 403);
    const request = JSON.parse(
      await readFile(
        new URL("../examples/studio/420-dice.json", import.meta.url),
        "utf8",
      ),
    );
    const seed = {
      seedId: request.seedId,
      parcelId: request.parcelId,
      title: request.title,
      objective: "Démonstration réelle sans publication",
      templates: [
        { id: "image-studio", config: { assetId: request.assetId } },
        {
          id: "audio-studio",
          config: {
            segments: request.segments,
            scriptRights: request.scriptRights,
          },
        },
        {
          id: "video-studio",
          config: { durationSeconds: request.durationSeconds },
        },
      ],
    };
    const cycleRoot = path.join(root, "cycle");
    await mkdir(path.join(cycleRoot, "scripts"), { recursive: true });
    await mkdir(path.join(cycleRoot, "garden"));
    const sourceDir = path.dirname(process.env.GERARD_STUDIO_CLIENT);
    for (const name of await readdir(sourceDir))
      if (name.endsWith(".mjs"))
        await copyFile(
          path.join(sourceDir, name),
          path.join(cycleRoot, "scripts", name),
        );
    await cp(
      path.join(sourceDir, "../templates"),
      path.join(cycleRoot, "templates"),
      { recursive: true },
    );
    await writeFile(
      path.join(cycleRoot, "garden/restart-seeds.json"),
      JSON.stringify({ seeds: [seed] }),
    );
    await writeFile(path.join(cycleRoot, "garden/gerard-state.json"), "{}");
    await writeFile(
      path.join(cycleRoot, "garden/harvests.json"),
      '{"harvests":[]}',
    );
    await promisify(execFile)(
      process.execPath,
      [path.join(cycleRoot, "scripts/gerard-cycle.mjs")],
      {
        cwd: cycleRoot,
        timeout: 180000,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          GERARD_MODE: "cultivate",
          GERARD_AV_STUDIO_ENABLED: "true",
          OCTOPUS_URL: base,
          LOCAL_PUBLISHER_URL: base,
          PUBLISHER_URL: base,
        },
      },
    );
    const cycleState = JSON.parse(
      await readFile(path.join(cycleRoot, "garden/gerard-state.json"), "utf8"),
    );
    assert.equal(cycleState.lastResult.status, "ok");
    assert.equal(
      cycleState.lastResult.decision,
      "studio-files-ready-for-review",
    );
    const operationId = studioOperationId(seed, "video");
    const archiveDir = path.join(
      cycleRoot,
      "garden/studio",
      seed.parcelId,
      operationId,
    );
    const options = {
      operationId,
      publisherUrl: base,
      outputDir: archiveDir,
      submit: async (mission: any) => {
        const response = await fetch(base + "/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mission),
        });
        return response.json();
      },
    };
    const result = await runParcelStudio(seed, options);
    assert.equal(result.status, "ready-for-review");
    assert.equal(result.report.video.verified, true);
    assert.equal(result.report.video.fullDecode, true);
    assert.equal(result.report.cost.externalProviderCalls, 0);
    assert.equal(result.report.audio.voice.language, "fr_FR");
    assert.equal(result.report.video.synchronizedCaptionCount, 6);
    assert.ok(
      result.report.video.imageMotionOutsideCaptions.filter(
        (n: number) => n > 0.35,
      ).length >= 2,
    );
    assert.equal(result.published, false);
    const mp4 = await readFile(path.join(archiveDir, "short.mp4"));
    if (process.env.STUDIO_ARTIFACT_DIR) {
      await mkdir(process.env.STUDIO_ARTIFACT_DIR, { recursive: true });
      for (const file of [
        "short.mp4",
        "report.json",
        "captions.srt",
        "poster.jpg",
      ])
        await copyFile(
          path.join(archiveDir, file),
          path.join(process.env.STUDIO_ARTIFACT_DIR, file),
        );
    }
    assert.equal(hash(mp4), result.report.artifact.sha256);
    const repeat = await runParcelStudio(seed, options);
    assert.equal(repeat.reused, true);
    assert.equal(missions, 1);
    assert.equal(adapterExecutions, 1);
    assert.equal(externalCalls, 0);
    await writeFile(
      path.join(archiveDir, "short.mp4"),
      Buffer.from("changed file"),
    );
    await assert.rejects(runParcelStudio(seed, options), /hash-mismatch/);
    assert.equal(missions, 1);
    const proof = {
      proof: "real-gerard-octopus-publisher-piper-ffmpeg",
      observedAt: new Date().toISOString(),
      providersSimulated: false,
      gerardCycleExecuted: true,
      cycleDecision: cycleState.lastResult.decision,
      externalCalls,
      missions,
      adapterExecutions,
      artifact: { sha256: hash(mp4), bytes: mp4.length },
      video: result.report.video,
      cost: result.report.cost,
      published: false,
      archiveVerified: true,
      repeatUsesVerifiedLocalArchive: true,
      tamperingRejected: true,
    };
    if (process.env.STUDIO_PROOF_PATH)
      await writeFile(
        process.env.STUDIO_PROOF_PATH,
        JSON.stringify(proof, null, 2) + "\n",
      );
    console.log("STUDIO_E2E_PROOF " + JSON.stringify(proof));
  },
);
