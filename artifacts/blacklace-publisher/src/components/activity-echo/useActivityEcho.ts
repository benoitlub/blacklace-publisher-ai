import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEvent, ActivityStatus, Pole } from "./types";

const MAX_EVENTS = 50;
const CALM_AFTER_MS = 8000;

const poleLabels: Record<Pole, string[]> = {
  radar: ["nouvelle graine repérée", "signal faible détecté", "tendance émergente"],
  observatoire: ["principes extraits", "motif reconnu", "hypothèse formée"],
  publisher: ["comparaison d'outils", "brouillon assemblé", "publication prête"],
  octopus: ["expérimentation lancée", "module orchestré", "flux déclenché"],
  garden: ["récolte préparée", "graine plantée", "germination observée"],
};

const statusToPole: Record<Exclude<ActivityStatus, "calme">, Pole> = {
  observation: "observatoire", reflexion: "observatoire", preparation: "publisher", experimentation: "octopus",
  recolte: "garden", blocage: "octopus", reussite: "garden",
};

export function useActivityEcho(initial?: ActivityEvent[]) {
  const [events, setEvents] = useState<ActivityEvent[]>(initial ?? []);
  const [status, setStatus] = useState<ActivityStatus>("calme");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback((partial: Omit<ActivityEvent, "id" | "at"> & { at?: number }) => {
    const event: ActivityEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: partial.at ?? Date.now(), pole: partial.pole, label: partial.label, status: partial.status };
    setEvents((previous) => [...previous, event].slice(-MAX_EVENTS));
    if (event.status) setStatus(event.status);
  }, []);

  const trigger = useCallback((nextStatus: Exclude<ActivityStatus, "calme">) => {
    const pole = statusToPole[nextStatus];
    const options = poleLabels[pole];
    push({ pole, label: options[Math.floor(Math.random() * options.length)], status: nextStatus });
  }, [push]);

  const reset = useCallback(() => { setStatus("calme"); setEvents([]); }, []);

  useEffect(() => {
    if (status === "calme") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus("calme"), CALM_AFTER_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status, events]);

  return useMemo(() => ({ events, status, push, trigger, reset }), [events, status, push, trigger, reset]);
}
