import { useEffect, useState } from "react";

const OFFICIAL_API_BASE_URL = "https://blacklace-publisher-api.onrender.com";

type State = "checking" | "connected" | "publisher-only" | "error";

type Health = {
  status?: string;
  engine?: { connected?: boolean; latencyMs?: number | null };
};

function apiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || OFFICIAL_API_BASE_URL).trim().replace(/\/$/, "");
  return `${base.endsWith("/api") ? base : `${base}/api`}${path}`;
}

export function OctopusWitness() {
  const [state, setState] = useState<State>("checking");
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(apiUrl("/octopus-adapter/health"), { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as Health;
        if (cancelled) return;
        if (!response.ok || payload.status !== "ok") {
          setState("error");
          return;
        }
        setLatency(typeof payload.engine?.latencyMs === "number" ? payload.engine.latencyMs : null);
        setState(payload.engine?.connected ? "connected" : "publisher-only");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const label = state === "connected" ? "Octopus connecté" : state === "publisher-only" ? "Adaptateur prêt" : state === "checking" ? "Octopus…" : "Octopus indisponible";
  const dot = state === "connected" ? "bg-emerald-400" : state === "publisher-only" || state === "checking" ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" title={latency !== null ? `Réponse Octopus en ${latency} ms` : label}>
      <span className="flex items-center gap-2"><span aria-hidden className={`h-2 w-2 rounded-full ${dot} ${state === "checking" ? "animate-pulse" : ""}`} />🐙 {label}</span>
      {latency !== null && state === "connected" ? <span>{latency} ms</span> : null}
    </div>
  );
}
