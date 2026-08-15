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
const canvaOk = payload.canva?.status === "executable";

if (!mistralOk || !canvaOk) {
  console.error(JSON.stringify({
    status: "provider-not-ready",
    mistral: payload.mistral ?? null,
    canva: payload.canva ?? null,
  }, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({ status: "providers-ready", mistral: true, canva: true }));
