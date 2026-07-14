import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL absent: skipping database schema push.");
  process.exit(0);
}

console.log("DATABASE_URL detected: applying Drizzle schema before API build...");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["--filter", "@workspace/db", "push"], {
  cwd: new URL("../../../", import.meta.url),
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("Unable to start Drizzle schema push:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
