import { useEffect, useState } from "react";

const OFFICIAL_API_BASE_URL = "https://blacklace-publisher-worker.benoitlubert.workers.dev";

type State = "checking" | "connected" | "publisher-only" | "error";
type TraceStatus = "idle" | "received" | "running" | "ready" | "failed";

type Trace = {
  missionId?: string | null;
  operationId?: string | null;
  capability?: string | null;
  contextId?: string | null;
  status?: TraceStatus;
  producer?: string | null;
  artifactCount?: number;
  receivedAt?: string | null;
  completedAt?: string | null;
  latencyMs?: number | null;
  error?: string | null;
};

type Health = {
  status?: string;
  engine?: { connected?: boolean; latencyMs?: number | null };
  trace?: Trace;
};

function apiUrl(path: string) {
  const base = String(import.meta.env.VITE_API_BASE_URL || OFFICIAL_API_BASE_URL).trim().replace(/\/$/, "");
  return `${base.endsWith("/api") ? base : `${base}/api`}${path}`;
}

function compactId(value?: string | null) {
  if (!value) return "—";
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function timeLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function OctopusWitness() {
  const [state, setState] = useState<State>("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [expanded, setExpanded] = useState(false);

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
        setTrace(payload.trace || null);
        setState(payload.engine?.connected ? "connected" : "publisher-only");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const label = state === "connected" ? "Octopus connecté" : state === "publisher-only" ? "Adaptateur prêt" : state === "checking" ? "Octopus…" : "Octopus indisponible";
  const dot = state === "connected" ? "bg-emerald-400" : state === "publisher-only" || state === "checking" ? "bg-amber-400" : "bg-red-400";
  const traceDot = trace?.status === "ready" ? "bg-emerald-400" : trace?.status === "failed" ? "bg-red-400" : trace?.status === "received" || trace?.status === "running" ? "bg-amber-400 animate-pulse" : "bg-muted-foreground/40";

  return (
    <div className="mb-3 rounded-md border border-border bg-background/40 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setExpanded((value) => !value)} title="Afficher la dernière mission passée entre Octopus et Publisher">
        <span className="flex items-center gap-2"><span aria-hidden className={`h-2 w-2 rounded-full ${dot} ${state === "checking" ? "animate-pulse" : ""}`} />🐙 {label}</span>
        <span>{latency !== null && state === "connected" ? `${latency} ms` : expanded ? "▲" : "▼"}</span>
      </button>
      {expanded ? (
        <div className="space-y-1 border-t border-border px-3 py-2 normal-case tracking-normal">
          <div className="flex items-center gap-2 font-semibold uppercase tracking-[0.08em]"><span className={`h-2 w-2 rounded-full ${traceDot}`} />Flux Octopus → Publisher</div>
          <div>Mission : {compactId(trace?.missionId || trace?.operationId)}</div>
          <div>Capacité : {trace?.capability || "aucune mission reçue"}</div>
          <div>Parcelle : {compactId(trace?.contextId)}</div>
          <div>État : {trace?.status || "idle"}</div>
          <div>Producteur : {trace?.producer || "—"}</div>
          <div>Artefacts : {trace?.artifactCount ?? 0}</div>
          <div>Reçue : {timeLabel(trace?.receivedAt)}</div>
          <div>Durée : {typeof trace?.latencyMs === "number" ? `${trace.latencyMs} ms` : "—"}</div>
          {trace?.error ? <div className="text-red-400">Erreur : {trace.error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
