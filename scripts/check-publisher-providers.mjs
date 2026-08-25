const baseUrl = (process.env.PUBLISHER_WORKER_URL || "https://blacklace-publisher-worker.benoitlubert.workers.dev").replace(/\/$/, "");

const response = await fetch(`${baseUrl}/api/production/diagnostics`, {
  headers: { accept: "application/json" },
});

const payload = await response.json().catch(() => ({}));
console.log(JSON.stringify({
  at: new Date().toISOString(),
  publisherUrl: baseUrl,
  httpStatus: response.status,
  diagnostics: payload,
}, null, 2));

if (!response.ok || payload.status === "failed") process.exit(1);

const mistralOk = payload.mistral?.available === true;
// `canva` a laissé la place à `visual` : le visuel n'est plus produit par un
// tiers mais dessiné par le Worker lui-même (voir publisher-worker/src/visual.ts).
const visualOk = payload.visual?.status === "executable";

if (!mistralOk || !visualOk) {
  console.error(JSON.stringify({
    status: "provider-not-ready",
    mistral: payload.mistral ?? null,
    visual: payload.visual ?? null,
  }, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({ status: "providers-ready", mistral: true, visual: true }));
