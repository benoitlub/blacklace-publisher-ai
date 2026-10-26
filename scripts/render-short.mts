import { readFile } from "node:fs/promises";
import { runStudio } from "../artifacts/api-server/src/publisher/studio/engine.ts";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Usage: tsx scripts/render-short.mts request.json [video.studio|audio.studio|image.studio]",
  );
const report = await runStudio(
  JSON.parse(await readFile(file, "utf8")),
  process.argv[3] || "video.studio",
);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "ready-for-review") process.exitCode = 1;
