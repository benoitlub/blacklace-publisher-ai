import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEchoProps, ActivityEvent, Pole } from "./types";
import "./ActivityEcho.css";

const POLES: { id: Pole; label: string; x: number; y: number }[] = [
  { id: "radar", label: "Radar", x: 28, y: 38 },
  { id: "observatoire", label: "Observatoire", x: 82, y: 24 },
  { id: "publisher", label: "Publisher", x: 158, y: 46 },
  { id: "octopus", label: "Octopus", x: 138, y: 112 },
  { id: "garden", label: "Garden", x: 52, y: 110 },
];

const LINKS: [Pole, Pole][] = [
  ["radar", "observatoire"], ["observatoire", "publisher"], ["publisher", "octopus"],
  ["octopus", "garden"], ["garden", "radar"], ["observatoire", "octopus"], ["publisher", "garden"],
];

const STATUS_LABEL: Record<string, string> = {
  calme: "Le jardin est calme. Gérard l’a décidé.", observation: "Gérard observe.", reflexion: "Gérard réfléchit.",
  preparation: "Gérard prépare.", experimentation: "Gérard expérimente.", recolte: "Gérard récolte.",
  blocage: "Gérard est bloqué.", reussite: "Gérard a réussi.",
};

function polePos(id: Pole) { return POLES.find((pole) => pole.id === id)!; }
function linkKey(a: Pole, b: Pole) { return [a, b].sort().join("-"); }
function poleName(pole: Pole) { return POLES.find((item) => item.id === pole)?.label ?? pole; }

export function ActivityEcho({ events = [], status, className, emptyMessage, onPoleClick }: ActivityEchoProps) {
  const lastEvent = events.length ? events[events.length - 1] : undefined;
  const derivedStatus = status ?? lastEvent?.status ?? "calme";
  const calmMessage = emptyMessage ?? STATUS_LABEL.calme;
  const [currentPole, setCurrentPole] = useState<Pole>("garden");
  const [activePole, setActivePole] = useState<Pole | null>(null);
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent || lastEvent.id === lastIdRef.current) return;
    lastIdRef.current = lastEvent.id;
    const from = currentPole;
    setCurrentPole(lastEvent.pole);
    setActivePole(lastEvent.pole);
    setActiveLink(linkKey(from, lastEvent.pole));
    const timer = setTimeout(() => { setActivePole(null); setActiveLink(null); }, 2000);
    return () => clearTimeout(timer);
  }, [lastEvent?.id]);

  useEffect(() => {
    if (derivedStatus !== "calme") return;
    const timer = setInterval(() => {
      setCurrentPole((previous) => {
        const others = POLES.filter((pole) => pole.id !== previous);
        return others[Math.floor(Math.random() * others.length)].id;
      });
    }, 6500);
    return () => clearInterval(timer);
  }, [derivedStatus]);

  const position = polePos(currentPole);
  const timelineItems = useMemo(() => events.slice(-5).reverse(), [events]);

  return (
    <div className={`ae-root ${className ?? ""}`} data-status={derivedStatus} role="group" aria-label="Écho d'activité de Gérard">
      <div className="ae-sr" aria-live="polite">{timelineItems.length ? STATUS_LABEL[derivedStatus] : calmMessage}</div>
      <div className="ae-scene">
        <svg className="ae-svg" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet">
          {LINKS.map(([a, b]) => {
            const from = polePos(a); const to = polePos(b); const key = linkKey(a, b);
            return <line key={key} className={`ae-link ${activeLink === key ? "is-active" : ""}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
          })}
          {POLES.map((pole) => (
            <g key={pole.id} className={`ae-pole ${activePole === pole.id ? "is-active" : ""}`} transform={`translate(${pole.x} ${pole.y})`} onClick={() => onPoleClick?.(pole.id)}>
              <circle className="ae-pole-halo" r={14} /><circle className="ae-pole-ring" r={5} /><circle className="ae-pole-core" r={2.2} />
              <text className="ae-pole-label" y={-9} textAnchor="middle">{pole.label}</text>
            </g>
          ))}
        </svg>
        <div className="ae-creature-wrap" style={{ left: `${(position.x / 200) * 100}%`, top: `${(position.y / 150) * 100}%` }} aria-hidden="true">
          <svg className="ae-creature" viewBox="-22 -22 44 44"><circle className="ae-creature-body" r={7} /><circle className="ae-creature-core" r={2.4} /><path className="ae-creature-tent" d="M -5 5 q -3 5 -8 6" /><path className="ae-creature-tent" d="M 0 7 q 0 6 1 10" /><path className="ae-creature-tent" d="M 5 5 q 4 5 8 5" /></svg>
        </div>
      </div>
      {timelineItems.length === 0 ? <div className="ae-veille">{calmMessage}</div> : (
        <ol className="ae-timeline" aria-label="Derniers événements">
          {timelineItems.map((event, index) => <li key={event.id} className="ae-timeline-item" style={{ opacity: 1 - index * 0.18 }} title={new Date(event.at).toLocaleTimeString()}><strong>{poleName(event.pole)}</strong><span>{event.label}</span>{index < timelineItems.length - 1 ? <span className="ae-timeline-sep"> · </span> : null}</li>)}
        </ol>
      )}
    </div>
  );
}

export type { ActivityEvent };
