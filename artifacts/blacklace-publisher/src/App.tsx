import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OctopusWitness } from "@/components/layout/octopus-witness";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import Radar from "@/pages/radar";
import Observatory from "@/pages/observatory";
import Memory from "@/pages/memory";
import Greenhouse from "@/pages/greenhouse";
import Autonomy from "@/pages/autonomy";
import ClientSpace from "@/pages/client-space";
import Calendar from "@/pages/calendar";
import Posts from "@/pages/posts";
import Campaigns from "@/pages/campaigns";
import Agents from "@/pages/agents";
import Connectors from "@/pages/connectors";
import LocalTechnique from "@/pages/local-technique";
import Settings from "@/pages/settings";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
setBaseUrl(apiBaseUrl?.trim() ? apiBaseUrl : null);
const buildSha = String(import.meta.env.VITE_BUILD_SHA || "local").slice(0, 7);

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/radar" component={Radar} />
        <Route path="/observatory" component={Observatory} />
        <Route path="/memory" component={Memory} />
        <Route path="/greenhouse" component={Greenhouse} />
        <Route path="/autonomy" component={Autonomy} />
        <Route path="/client" component={ClientSpace} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/posts" component={Posts} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/agents" component={Agents} />
        <Route path="/local-technique" component={LocalTechnique} />
        <Route path="/connectors" component={Connectors} />
        <Route path="/settings" component={Settings} />
        <Route>
          <div className="p-8 text-center border border-dashed border-border rounded-lg max-w-lg mx-auto mt-20">
            <h2 className="text-2xl font-serif text-foreground mb-2">Dossier Expurgé</h2>
            <p className="font-mono text-sm text-muted-foreground">Cette coordonnée n'existe pas dans la base de données. Revenez au tableau de bord.</p>
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <div className="fixed bottom-12 right-3 z-50 w-[min(19rem,calc(100vw-1.5rem))] shadow-lg">
          <OctopusWitness />
        </div>
        <div className="fixed bottom-3 right-3 z-50 rounded border border-border bg-card/95 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground shadow-lg">
          Build {buildSha} · Production
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;