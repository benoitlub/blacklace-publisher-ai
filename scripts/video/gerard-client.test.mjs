import test from "node:test";
import assert from "node:assert/strict";
import {
  videoMission,
  retrieveVideo,
  registerVideoCapabilities,
} from "./gerard-client.mjs";
const id = "a".repeat(64),
  digest = "b".repeat(64);
test("prepare is inert by default and has a different trace from render", () => {
  const pack = {
    characterId: "natasha",
    destination: { project: "blacklace-island" },
  };
  const preview = videoMission(pack, { now: new Date(1) }),
    render = videoMission(pack, { render: true, now: new Date(1) });
  assert.deepEqual(preview.authorizedResources, []);
  assert.deepEqual(preview.requiredCapabilities, ["video.prepare"]);
  assert.deepEqual(render.authorizedResources, ["video.render"]);
  assert.notEqual(preview.operationId, render.operationId);
});
test("ID alone or an external download URL never establishes a usable video", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error("No network expected");
  };
  for (const result of [
    { status: "completed", output: { artifact: { id } } },
    {
      status: "completed",
      output: {
        status: "ready-for-review",
        artifact: {
          id,
          mimeType: "video/mp4",
          sha256: digest,
          downloadUrl: "https://evil.test/video.mp4",
        },
      },
    },
  ])
    await assert.rejects(retrieveVideo(result, { fetchImpl }));
  assert.equal(calls, 0);
});
test("download bytes must match the advertised MP4 digest", async () => {
  const result = {
    status: "completed",
    output: {
      status: "ready-for-review",
      artifact: {
        id,
        mimeType: "video/mp4",
        sha256: digest,
        bytes: 7,
        downloadUrl: `/api/production/video/artifacts/${id}/video.mp4`,
      },
    },
  };
  await assert.rejects(
    retrieveVideo(result, {
      fetchImpl: async () =>
        new Response("changed", { headers: { "Content-Type": "video/mp4" } }),
    }),
    /VIDEO_DOWNLOAD_HASH_MISMATCH/,
  );
});
test("opt-in registration refuses to replace a different Publisher endpoint", async () => {
  let writes = 0;
  await assert.rejects(
    registerVideoCapabilities({
      fetchImpl: async (url, init) => {
        if (init?.method === "POST") writes++;
        return Response.json(
          String(url).endsWith("/catalog")
            ? { contract: "publisher-video-catalog-v1", runtimeReady: true }
            : {
                adapters: [
                  {
                    id: "publisher",
                    executeUrl: "https://another-publisher.test/execute",
                    capabilities: ["social.publish"],
                  },
                ],
              },
        );
      },
    }),
    /VIDEO_ADAPTER_DESTINATION_MISMATCH/,
  );
  assert.equal(writes, 0);
});
