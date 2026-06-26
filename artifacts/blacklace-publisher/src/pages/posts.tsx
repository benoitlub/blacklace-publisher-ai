import { useListPosts, getListPostsQueryKey, useDeletePost, useApprovePost } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, CheckCircle, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-blue-900/50 text-blue-200 border-blue-800",
  scheduled: "bg-amber-900/50 text-amber-200 border-amber-800",
  published: "bg-green-900/50 text-green-200 border-green-800",
  failed: "bg-destructive/50 text-destructive-foreground border-destructive",
};

export default function Posts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: posts, isLoading } = useListPosts({}, {
    query: { queryKey: getListPostsQueryKey({}) }
  });

  const deletePost = useDeletePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({}) });
        toast({ title: "Opération réussie", description: "Le dossier a été détruit." });
      }
    }
  });

  const approvePost = useApprovePost({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({}) });
        toast({ title: "Opération réussie", description: "Le dossier a été approuvé." });
      }
    }
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2 tracking-tight">Dossiers</h1>
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">Publications de l'Institut</p>
        </div>
        <Button className="bg-secondary hover:bg-secondary/80 text-foreground font-mono font-bold">
          Nouveau Dossier
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full bg-secondary" />
          ))}
        </div>
      ) : posts?.length ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id} className="bg-card border-border hover:border-primary/50 transition-all overflow-hidden group">
              <CardContent className="p-0">
                <div className="flex items-stretch">
                  <div className="w-1.5 bg-primary/20 group-hover:bg-primary transition-colors"></div>
                  <div className="p-4 flex-1 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", STATUS_COLORS[post.status] || "bg-secondary")}>
                          {post.status}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground uppercase">{post.platform}</span>
                      </div>
                      <h3 className="text-lg font-serif font-medium text-foreground mb-1">{post.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.content}</p>
                      
                      <div className="flex items-center gap-4 mt-3 text-xs font-mono text-muted-foreground">
                        <span>Opérateur: {post.agentName || "Anonyme"}</span>
                        <span>Créé le: {format(parseISO(post.createdAt), "dd MMM yyyy", { locale: fr })}</span>
                        {post.universe && <span>Secteur: {post.universe}</span>}
                      </div>
                    </div>
                    
                    <div className="flex md:flex-col gap-2">
                      {post.status === 'draft' && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="font-mono text-xs border-blue-900 text-blue-400 hover:bg-blue-900/20"
                          onClick={() => approvePost.mutate({ id: post.id })}
                          disabled={approvePost.isPending}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approuver
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="font-mono text-xs border-border bg-secondary hover:bg-secondary/80">
                        <Edit2 className="w-3 h-3 mr-1" />
                        Modifier
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="font-mono text-xs border-destructive text-destructive hover:bg-destructive/20"
                        onClick={() => deletePost.mutate({ id: post.id })}
                        disabled={deletePost.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Détruire
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center border border-dashed border-border rounded-lg bg-card/50">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-serif mb-2">Aucun dossier</h3>
          <p className="text-muted-foreground font-mono text-sm">Les archives sont vides.</p>
        </div>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
