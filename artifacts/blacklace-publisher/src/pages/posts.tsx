import { useListPosts, getListPostsQueryKey, useDeletePost, useApprovePost } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Edit2, Image as ImageIcon, Leaf, Send, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-900/50 text-blue-200 border-blue-800",
  scheduled: "bg-amber-900/50 text-amber-200 border-amber-800",
  published: "bg-green-900/50 text-green-200 border-green-800",
  failed: "bg-destructive/50 text-destructive-foreground border-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "À publier",
  approved: "Validé",
  scheduled: "Programmé",
  published: "Publié",
  failed: "Échec",
};

function postMeta(post: any) {
  const raw = post.metadata && typeof post.metadata === "object" ? post.metadata : {};
  return {
    mediaUrl: raw.mediaUrl || raw.visualUrl || raw.imageUrl || post.mediaUrl || post.imageUrl || null,
    scheduledAt: raw.scheduledAt || raw.publicationDate || post.scheduledAt || null,
    decision: raw.decision || raw.editorialDecision || post.decision || null,
    rationale: raw.rationale || raw.reason || raw.hypothesis || post.rationale || null,
    confidence: raw.confidence || post.confidence || null,
    seedId: raw.seedId || post.seedId || null,
  };
}

export default function Posts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: posts, isLoading } = useListPosts({}, { query: { queryKey: getListPostsQueryKey({}) } });

  const deletePost = useDeletePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({}) });
        toast({ title: "Composté", description: "Cette proposition quitte la file éditoriale." });
      }
    }
  });

  const approvePost = useApprovePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({}) });
        toast({ title: "Validé", description: "La proposition est prête pour l'étape Metricool. Rien n'est publié automatiquement." });
      }
    }
  });

  const drafts = posts?.filter((post) => post.status === "draft") ?? [];
  const history = posts?.filter((post) => post.status !== "draft") ?? [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
              <Send className="h-3.5 w-3.5" /> Gérard · file éditoriale
            </div>
            <h1 className="text-4xl font-bold tracking-tight">À publier</h1>
            <p className="page-subtitle mt-2 max-w-2xl font-mono text-sm text-muted-foreground">
              Ce que Gérard compte publier, pourquoi il le propose et où il veut l'envoyer.
            </p>
          </div>
          <div className="rounded border border-border bg-card px-4 py-3 text-right">
            <div className="font-mono text-2xl font-bold">{drafts.length}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">en attente</div>
          </div>
        </div>
        <div className="mt-4 rounded border border-amber-800/60 bg-amber-950/20 px-4 py-3 font-mono text-xs text-amber-200">
          Mode supervision · Valider prépare la sortie Metricool. La publication automatique reste désactivée.
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">{[0,1,2,3].map((i) => <Skeleton key={i} className="h-96 bg-secondary" />)}</div>
      ) : drafts.length ? (
        <section className="grid gap-5 lg:grid-cols-2">
          {drafts.map((post) => <PublicationCard key={post.id} post={post} approve={() => approvePost.mutate({ id: post.id })} compost={() => deletePost.mutate({ id: post.id })} busy={approvePost.isPending || deletePost.isPending} />)}
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/40 p-12 text-center">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h3 className="text-lg font-medium">Rien dans la file</h3>
          <p className="mt-2 font-mono text-sm text-muted-foreground">Les prochaines propositions de Gérard apparaîtront ici avant publication.</p>
        </div>
      )}

      {history.length > 0 && (
        <section className="space-y-3 border-t border-border pt-7">
          <div>
            <h2 className="text-xl font-semibold">Journal éditorial</h2>
            <p className="font-mono text-xs text-muted-foreground">Validé · programmé · publié · échec</p>
          </div>
          {history.map((post) => {
            const meta = postMeta(post);
            return (
              <div key={post.id} className="flex flex-col gap-2 rounded border border-border bg-card/50 p-4 md:flex-row md:items-center">
                <Badge variant="outline" className={cn("w-fit font-mono text-[10px] uppercase", STATUS_COLORS[post.status] || "bg-secondary")}>{STATUS_LABELS[post.status] || post.status}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{post.title}</div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">{post.platform}{meta.decision ? ` · ${meta.decision}` : ""}</div>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">{format(parseISO(post.createdAt), "dd MMM yyyy · HH:mm", { locale: fr })}</div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function PublicationCard({ post, approve, compost, busy }: { post: any; approve: () => void; compost: () => void; busy: boolean }) {
  const meta = postMeta(post);
  const networks = String(post.platform || "").split(/[,;+]/).map((v) => v.trim()).filter(Boolean);
  return (
    <Card className="overflow-hidden border-border bg-card">
      <CardContent className="p-0">
        <div className="relative aspect-[16/9] overflow-hidden border-b border-border bg-muted">
          {meta.mediaUrl ? (
            <img src={meta.mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="font-mono text-[10px] uppercase tracking-wider">Aucun média attaché</span>
            </div>
          )}
          <Badge className="absolute left-3 top-3 bg-background/90 font-mono text-[10px] uppercase text-foreground">{STATUS_LABELS[post.status] || post.status}</Badge>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {networks.map((network) => <Badge key={network} variant="outline" className="font-mono text-[10px] uppercase">{network}</Badge>)}
              {meta.decision && <Badge variant="outline" className="border-primary/50 font-mono text-[10px] uppercase text-primary">{meta.decision}</Badge>}
            </div>
            <h3 className="text-xl font-semibold">{post.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{post.content}</p>
          </div>

          <div className="grid gap-3 border-y border-border py-4 text-xs">
            <Meta label="Prévu" value={meta.scheduledAt ? format(parseISO(meta.scheduledAt), "dd MMM yyyy · HH:mm", { locale: fr }) : "Date à définir"} />
            <Meta label="Proposé par" value={post.agentName || "Gérard"} />
            {post.universe && <Meta label="Projet" value={post.universe} />}
            {meta.rationale && <Meta label="Pourquoi" value={meta.rationale} />}
            {meta.confidence && <Meta label="Confiance" value={String(meta.confidence)} />}
            {meta.seedId && <Meta label="Seed" value={String(meta.seedId)} />}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline" className="font-mono text-xs" onClick={() => toastUnavailable("Modification")}>
              <Edit2 className="mr-1 h-3.5 w-3.5" /> Modifier
            </Button>
            <Button size="sm" variant="outline" className="border-amber-900 font-mono text-xs text-amber-300 hover:bg-amber-950/30" onClick={compost} disabled={busy}>
              <Leaf className="mr-1 h-3.5 w-3.5" /> Composter
            </Button>
            <Button size="sm" className="font-mono text-xs" onClick={approve} disabled={busy}>
              <CheckCircle className="mr-1 h-3.5 w-3.5" /> Valider
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[90px_1fr] gap-3"><span className="font-mono uppercase text-muted-foreground">{label}</span><span>{value}</span></div>;
}

function toastUnavailable(_label: string) {
  window.alert("L'éditeur arrive à l'étape suivante. Pour l'instant, cette vue sert à superviser et valider.");
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
