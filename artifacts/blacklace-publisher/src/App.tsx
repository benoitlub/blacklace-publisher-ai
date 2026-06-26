import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import Posts from "@/pages/posts";
import Campaigns from "@/pages/campaigns";
import Agents from "@/pages/agents";
import Connectors from "@/pages/connectors";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/posts" component={Posts} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/agents" component={Agents} />
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
