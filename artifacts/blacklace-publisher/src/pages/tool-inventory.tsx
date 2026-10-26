import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/services/api-base";
import { RefreshCw, Wrench } from "lucide-react";

type State = "decouvert" | "a-tester" | "operationnel" | "indisponible";
type Item = { id: string; name: string; source: string; state: State; proof: string; capability?: string; url?: string; lastSuccess?: string; cost?: string };
type Gem = { name: string; url: string; capabilities?: string[]; decision?: string; costs?: { verified?: boolean }; provenance?: { verifiedFunctionality?: boolean } };

const LABELS: Record<State, string> = {
  decouvert: "Découvert", "a-tester": "À tester", operationnel: "Opérationnel", indisponible: "Indisponible",
};

async function jsonFrom(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Discoveries are never promoted from a provider schema to an operational tool. */
export function buildInventory(gems: Gem[], schema: { slug?: string; name?: string }[]): Item[] {
  const items: Item[] = gems.map((gem) => ({
    id: `github:${gem.name}`, name: gem.name, source: "GitHub / veille quotidienne",
    state: gem.decision === "needs-review" ? "a-tester" : "decouvert",
    proof: "Métadonnées du dépôt, sans essai d'exécution",
    capability: gem.capabilities?.join(", ") || "À qualifier", url: gem.url,
    cost: gem.costs?.verified ? "Vérifié" : "Coût et quotas non vérifiés",
  }));
  for (const tool of schema) {
    const name = tool.slug || tool.name;
    if (!name || items.some((item) => item.id === `composio:${name}`)) continue;
    items.push({ id: `composio:${name}`, name, source: "Composio / schéma déclaré", state: "a-tester",
      proof: "Schéma découvert ; aucune réussite d'exécution démontrée", cost: "Quota à vérifier" });
  }
  return items;
}

export default function ToolInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<string[]>([]);
  const [filter, setFilter] = useState<State | "tous">("tous");

  async function refresh() {
    setLoading(true);
    const warnings: string[] = [];
    const [gemResult, schemaResult, seedResult] = await Promise.allSettled([
      jsonFrom(`${import.meta.env.BASE_URL}knowledge-packs/autonomous-github-gems.json`),
      jsonFrom(apiUrl("/observatory/discovery/schema")),
      jsonFrom(`${import.meta.env.BASE_URL}knowledge-packs/tool-inventory-seed.json`),
    ]);
    const gems = gemResult.status === "fulfilled" && Array.isArray(gemResult.value?.gems) ? gemResult.value.gems as Gem[] : [];
    if (gemResult.status === "rejected") warnings.push("Catalogue GitHub non disponible : la routine n'a peut-être pas encore produit de récolte.");
    const data = schemaResult.status === "fulfilled" ? schemaResult.value : null;
    const liveSchema = Array.isArray(data?.tools) ? data.tools : Array.isArray(data?.data?.tools) ? data.data.tools : [];
    const historical = seedResult.status === "fulfilled" && Array.isArray(seedResult.value?.tools) ? seedResult.value.tools : [];
    const schema = liveSchema.length ? liveSchema : historical;
    if (schemaResult.status === "rejected" || !liveSchema.length) warnings.push("Inventaire Composio : dernier diagnostic documenté du 24 octobre ; accès en direct non confirmé.");
    setItems(buildInventory(gems, schema));
    setNotes(warnings);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);
  const visible = useMemo(() => items.filter((item) => filter === "tous" || item.state === filter), [items, filter]);

  return <div className="space-y-6 min-w-0">
    <header className="space-y-2">
      <h1 className="text-3xl font-serif font-bold">Inventaire de Publisher</h1>
      <p className="text-sm text-muted-foreground">Publisher découvre et documente · Gérard expérimente · Octopus exécute uniquement les capacités autorisées.</p>
      <p className="text-xs text-muted-foreground">Un outil détecté ou connecté n'est jamais déclaré opérationnel sans preuve d'exécution réussie et datée.</p>
    </header>
    <div className="flex flex-wrap gap-2 items-center">
      {(["tous", "decouvert", "a-tester", "operationnel", "indisponible"] as const).map((state) => <Button key={state} size="sm" variant={filter === state ? "default" : "outline"} onClick={() => setFilter(state)}>{state === "tous" ? "Tous" : LABELS[state]}</Button>)}
      <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" /> Actualiser</Button>
    </div>
    {notes.map((note) => <p key={note} className="rounded border border-amber-500/30 p-3 text-sm text-amber-600">{note}</p>)}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((item) => <Card key={item.id} className="min-w-0">
        <CardHeader className="space-y-2"><CardTitle className="flex gap-2 items-start break-all text-base"><Wrench className="h-4 w-4 shrink-0 mt-1" />{item.name}</CardTitle><Badge variant="outline" className="w-fit">{LABELS[item.state]}</Badge></CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground break-words">
          <p><strong>Source :</strong> {item.source}</p><p><strong>Preuve :</strong> {item.proof}</p>
          {item.capability && <p><strong>Capacités suggérées :</strong> {item.capability}</p>}
          <p><strong>Dernier succès :</strong> {item.lastSuccess || "Non constaté"}</p>
          <p><strong>Coût :</strong> {item.cost || "Non vérifié"}</p>
          {item.url && <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">Examiner la source</a>}
        </CardContent>
      </Card>)}
    </div>
    {!loading && !visible.length && <p className="rounded border border-dashed p-6 text-sm text-muted-foreground">Aucune entrée vérifiable pour ce filtre. Cela ne signifie pas qu'aucun outil n'existe.</p>}
  </div>;
}
