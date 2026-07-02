import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadHarvestDrafts,
  loadMissions,
  loadPublicationDrafts,
  PUBLISHER_LOOP_CHANGED_EVENT,
  type ClientMission,
  type HarvestDraft,
  type ProposedSeed,
  type PublicationDraft
} from "@/lib/missions";

interface LoopState {
  readonly missions: ClientMission[];
  readonly harvestDrafts: HarvestDraft[];
  readonly publicationDrafts: PublicationDraft[];
  readonly scheduledPosts: ScheduledPost[];
}

interface ScheduledPost {
  readonly id: number;
  readonly title: string;
  readonly platform: string;
  readonly status: string;
  readonly scheduledAt?: string | null;
}

export function PublisherLoopPanel() {
  const [state, setState] = useState<LoopState>(() => loadLoopState());

  useEffect(() => {
    const refresh = () => {
      setState(loadLoopState());
      void loadScheduledPosts().then((scheduledPosts) => setState((current) => ({ ...current, scheduledPosts })));
    };
    refresh();
    window.addEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PUBLISHER_LOOP_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const loop = useMemo(() => summarizeLoop(state), [state]);

  return (
    <Card className="bg-card border-border shadow-md">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="font-serif">Travail en cours d'Octopus</CardTitle>
        <CardDescription className="font-mono text-xs">
          Vue locale de la boucle Publisher : Intent vers Publication.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-6">
        <LoopColumn title="Intentions recues" count={loop.intentions.length}>
          {loop.intentions.map((mission) => (
            <LoopItem key={mission.id} title={mission.parcel} detail={mission.intent} />
          ))}
        </LoopColumn>

        <LoopColumn title="Missions structurees" count={loop.missions.length}>
          {loop.missions.map((mission) => (
            <LoopItem key={mission.id} title={mission.id} detail={`${mission.parcel} - ${mission.octopusStatus}`} />
          ))}
        </LoopColumn>

        <LoopColumn title="Graines proposees" count={loop.seeds.length}>
          {loop.seeds.map(({ mission, seed }) => (
            <LoopItem key={seed.id} title={seed.label} detail={`${mission.parcel} - ${seed.type}`} />
          ))}
        </LoopColumn>

        <LoopColumn title="Elements WIP" count={loop.wip.length}>
          {loop.wip.map(({ mission, seed }) => (
            <LoopItem key={seed.id} title={seed.label} detail={mission.parcel} />
          ))}
        </LoopColumn>

        <LoopColumn title="Garden" count={loop.gardenItems}>
          <LoopItem title="Seeds / WIP / Harvest" detail={`${loop.seeds.length} seed(s), ${loop.wip.length} WIP, ${loop.harvestDrafts.length} recolte(s)`} />
        </LoopColumn>

        <LoopColumn title="Recoltes preparees" count={loop.harvestDrafts.length}>
          {loop.harvestDrafts.map((draft) => (
            <LoopItem key={draft.id} title={draft.title} detail={draft.parcel} />
          ))}
        </LoopColumn>

        <LoopColumn title="Publications a generer" count={loop.publicationsToGenerate.length}>
          {loop.publicationsToGenerate.map((draft) => (
            <LoopItem key={draft.id} title={draft.title} detail={draft.parcel} />
          ))}
        </LoopColumn>

        <LoopColumn title="Publications pretes" count={loop.readyPublications.length}>
          {loop.readyPublications.map((draft) => (
            <LoopItem key={draft.id} title={draft.title} detail={`${draft.channel} - ${draft.source}`} />
          ))}
        </LoopColumn>

        <LoopColumn title="Calendrier" count={loop.calendarItems.length}>
          {loop.calendarItems.map((post) => (
            <LoopItem key={post.id} title={post.title} detail={`${post.platform} - ${post.status}`} />
          ))}
        </LoopColumn>

        <LoopColumn title="Publication" count={loop.publishedItems.length}>
          {loop.publishedItems.map((post) => (
            <LoopItem key={post.id} title={post.title} detail={post.platform} />
          ))}
        </LoopColumn>
      </CardContent>
    </Card>
  );
}

function loadLoopState(): LoopState {
  return {
    missions: loadMissions(),
    harvestDrafts: loadHarvestDrafts(),
    publicationDrafts: loadPublicationDrafts(),
    scheduledPosts: []
  };
}

function summarizeLoop(state: LoopState) {
  const seeds = collectSeedsByStatus(state.missions, "seed");
  const wip = collectSeedsByStatus(state.missions, "wip");
  const generatedHarvestIds = new Set(state.publicationDrafts.map((draft) => draft.harvestDraftId));
  const readyPublications = state.publicationDrafts.filter((draft) => draft.status === "ready-to-publish");
  const calendarItems = state.scheduledPosts.filter((post) => post.status !== "published");
  const publishedItems = state.scheduledPosts.filter((post) => post.status === "published");

  return {
    intentions: state.missions,
    missions: state.missions.filter((mission) => mission.octopusStatus === "received"),
    seeds,
    wip,
    gardenItems: seeds.length + wip.length + state.harvestDrafts.length,
    harvestDrafts: state.harvestDrafts,
    publicationsToGenerate: state.harvestDrafts.filter((draft) => !generatedHarvestIds.has(draft.id)),
    readyPublications,
    calendarItems,
    publishedItems
  };
}

async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  try {
    const response = await fetch("/api/calendar");
    if (!response.ok) {
      return [];
    }

    const posts = (await response.json()) as ScheduledPost[];
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

function collectSeedsByStatus(missions: readonly ClientMission[], status: ProposedSeed["status"]) {
  return missions.flatMap((mission) =>
    (mission.octopusResponse?.proposedSeeds ?? [])
      .filter((seed) => seed.status === status)
      .map((seed) => ({ mission, seed }))
  );
}

function LoopColumn({
  title,
  count,
  children
}: {
  readonly title: string;
  readonly count: number;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-secondary/20 p-3 min-h-32">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-base font-semibold">{title}</h3>
        <span className="rounded border border-border bg-background/40 px-2 py-1 text-xs font-mono text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {count === 0 ? <p className="text-xs font-mono text-muted-foreground">Rien pour l'instant.</p> : children}
      </div>
    </section>
  );
}

function LoopItem({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <article className="rounded border border-border bg-background/40 p-2">
      <p className="text-sm font-medium text-foreground line-clamp-2">{title}</p>
      <p className="mt-1 text-xs font-mono text-muted-foreground line-clamp-2">{detail}</p>
    </article>
  );
}
