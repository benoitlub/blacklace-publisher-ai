import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { videoReferences } from "../artifacts/api-server/src/publisher/video/catalog.ts";

// Real FFmpeg and real existing Octopus/API. Only pinned source GET and loopback
// are allowed; no AI provider, Composio, social API or public write is reachable.
test(
  "Gerard -> existing Octopus -> local Publisher -> verified MP4 -> feedback -> improved MP4",
  { timeout: 180000 },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "publisher-video-e2e-"));
    const prior = {
      DATABASE_URL: process.env.DATABASE_URL,
      PUBLISHER_VIDEO_DIR: process.env.PUBLISHER_VIDEO_DIR,
    };
    process.env.DATABASE_URL =
      "postgresql://simulation:simulation@simulation.invalid/simulation";
    process.env.PUBLISHER_VIDEO_DIR = root;
    t.after(async () => {
      for (const [k, v] of Object.entries(prior)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await rm(root, { recursive: true, force: true });
    });
    const ref = videoReferences["natasha-fragment-03"];
    const { default: express } = await import(
      new URL(
        "../artifacts/api-server/node_modules/express/index.js",
        import.meta.url,
      ).href
    );
    const { default: videoRouter } =
      await import("../artifacts/api-server/src/routes/video.ts");
    const { default: adapterRouter } =
      await import("../artifacts/api-server/src/routes/octopus-adapter.ts");
    const app = express();
    app.use(express.json());
    app.use("/api/production/video", videoRouter);
    app.use("/api/octopus-adapter", adapterRouter);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const publisherUrl = `http://127.0.0.1:${address.port}`;
    const { app: octopus } = await import(
      new URL(
        "../artifacts/api-server/node_modules/octopus-engine/dist/app.js",
        import.meta.url,
      ).href
    );
    const nativeFetch = globalThis.fetch,
      trace: string[] = [];
    let sourceReads = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init),
          url = new URL(req.url);
        if (url.origin === "https://octopus-video.test") {
          trace.push(`octopus:${url.pathname}`);
          return octopus.fetch(req);
        }
        if (url.origin === publisherUrl) {
          trace.push(`publisher:${req.method}:${url.pathname}`);
          return nativeFetch(req);
        }
        if (url.href === ref.url && req.method === "GET") {
          sourceReads++;
          trace.push("source:pinned-existing-video-GET");
          return process.env.PUBLISHER_VIDEO_TEST_SOURCE
            ? new Response(
                await readFile(process.env.PUBLISHER_VIDEO_TEST_SOURCE),
                { headers: { "Content-Type": "video/mp4" } },
              )
            : nativeFetch(req);
        }
        throw new Error(
          `No provider/unplanned network allowed in video test: ${url.origin}${url.pathname}`,
        );
      },
    );
    const client = await import("./video/gerard-client.mjs");
    await octopus.request("/adapters/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "publisher",
        name: "Publisher",
        capabilities: ["social.publish", "content.generate"],
        executeUrl: `${publisherUrl}/api/octopus-adapter/execute`,
      }),
    });
    const request = JSON.parse(
      await readFile(
        new URL("../docs/prototypes/natasha/request.json", import.meta.url),
        "utf8",
      ),
    );
    const options = {
      octopusUrl: "https://octopus-video.test",
      publisherUrl,
      outputDir: path.join(root, "gerard-downloads"),
    };
    const registered = await client.registerVideoCapabilities(options);
    assert.ok(registered.adapter.capabilities.includes("social.publish"));
    assert.ok(registered.adapter.capabilities.includes("content.generate"));
    const prepared = await client.submitVideoMission(
      client.videoMission(request),
      options,
    );
    assert.equal(prepared.status, "completed");
    assert.deepEqual(prepared.output.videoPackage, request);
    const first = await client.submitVideoMission(
      client.videoMission(request, { render: true }),
      options,
    );
    assert.equal(
      first.output.status,
      "ready-for-review",
      JSON.stringify(first),
    );
    const downloaded = await client.retrieveVideo(first, options);
    assert.ok(downloaded.verifiedBytes > 10000);
    assert.equal(
      createHash("sha256")
        .update(await readFile(downloaded.file))
        .digest("hex"),
      first.output.artifact.sha256,
    );
    const similarity = await promisify(execFile)(
      "ffmpeg",
      [
        "-v",
        "info",
        "-nostdin",
        "-i",
        path.join(root, "sources", ref.sha256 + ".mp4"),
        "-i",
        downloaded.file,
        "-filter_complex",
        "[0:v]trim=duration=10,setpts=PTS-STARTPTS,fps=30,scale=1080:780:force_original_aspect_ratio=decrease,pad=1080:780:(ow-iw)/2:(oh-ih)/2:color=0x0b0c16,setsar=1,format=yuv420p[ref];[1:v]crop=1080:780:0:420,setpts=PTS-STARTPTS[rendered];[ref][rendered]ssim[out]",
        "-map",
        "[out]",
        "-t",
        "10",
        "-threads",
        "2",
        "-filter_complex_threads",
        "1",
        "-f",
        "null",
        "-",
      ],
      { timeout: 60000, maxBuffer: 1024 * 1024 },
    );
    const referenceViewportSSIM = Number(
      similarity.stderr.match(/All:([0-9.]+)/)?.[1],
    );
    assert.ok(
      referenceViewportSSIM > 0.98,
      "The full official video viewport must survive assembly and encoding.",
    );
    assert.equal(first.output.cost.externalProviderCharge, 0);
    assert.equal(first.output.quality.technicalPassed, true);
    assert.equal(first.output.publication.performed, false);
    const repeated = await client.submitVideoMission(
      client.videoMission(request, {
        render: true,
        now: new Date(Date.now() + 1),
      }),
      options,
    );
    assert.equal(repeated.output.artifactId, first.output.artifactId);
    assert.equal(repeated.output.reused, true);
    const range = await fetch(
      new URL(first.output.artifact.downloadUrl, publisherUrl),
      { headers: { Range: "bytes=0-63" } },
    );
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 64);
    const forbidden = await fetch(
      `${publisherUrl}/api/production/video/catalog`,
      { headers: { "x-forwarded-for": "203.0.113.1" } },
    );
    assert.equal(forbidden.status, 403);
    const review = {
      artifactId: first.output.artifactId,
      reviewer: "gerard",
      comparisons: [
        {
          criterion: "pacing",
          result: "defect",
          expected: "Quatre secondes sur la conclusion",
          observed: "La conclusion ne reste que trois secondes",
        },
      ],
      nextChanges: {
        storyboard: [
          { start: 0, end: 3, text: "LE SIGNAL PASSE." },
          { start: 3, end: 6, text: "NATASHA\nDEPUIS BLACKLACE." },
          { start: 6, end: 10, text: "EXPLOREZ\nBLACKLACE ISLAND." },
        ],
      },
    };
    const learning = await client.submitVideoMission(
      client.videoReviewMission(review),
      options,
    );
    assert.equal(learning.output.automaticRender, false);
    assert.equal(
      learning.output.nextPackage.learningFrom.artifactId,
      first.output.artifactId,
    );
    const second = await client.submitVideoMission(
      client.videoMission(learning.output.nextPackage, { render: true }),
      options,
    );
    assert.equal(
      second.output.status,
      "ready-for-review",
      JSON.stringify(second),
    );
    assert.notEqual(second.output.artifactId, first.output.artifactId);
    assert.deepEqual(
      second.output.request.storyboard,
      review.nextChanges.storyboard,
    );
    await client.retrieveVideo(second, options);
    const missionStatus = (await (
      await octopus.request(`/missions/${first.missionId}`)
    ).json()) as any;
    assert.equal(missionStatus.status, "completed");
    const proof = {
      proof: "gerard-existing-octopus-publisher-ffmpeg-mp4-feedback-next-mp4",
      mode: "actual-local-render",
      creativeBrief: "user-demo",
      feedback: "simulated-gerard-fixture",
      externalProviderWrites: 0,
      externalProviderCharge: 0,
      sourceReads,
      sourceTransport: process.env.PUBLISHER_VIDEO_TEST_SOURCE
        ? "official-local-bytes-as-download-fixture"
        : "pinned-GitHub-GET",
      referenceViewportSSIM,
      firstArtifact: first.output.artifact,
      improvedArtifact: second.output.artifact,
      repeatedRequestRenders: 0,
      technicalQC: first.output.quality,
      publication: second.output.publication,
      trace,
    };
    if (process.env.PUBLISHER_VIDEO_PROOF_PATH)
      await writeFile(
        process.env.PUBLISHER_VIDEO_PROOF_PATH,
        JSON.stringify(proof, null, 2) + "\n",
      );
    console.log(JSON.stringify(proof));
  },
);
