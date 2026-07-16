import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Plug,
  Settings as SettingsIcon,
  Tent,
  Building2,
  X,
  Telescope,
  Radar,
  Database,
  Sprout,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OctopusWitness } from "./octopus-witness";

const NAV_GROUPS = [
  {
    label: "Observer et préparer",
    items: [
      { href: "/", label: "Vue technique", icon: LayoutDashboard },
      { href: "/observatory", label: "Observatoire", icon: Telescope },
      { href: "/radar", label: "Radar", icon: Radar },
      { href: "/memory", label: "Mémoire", icon: Database },
      { href: "/greenhouse", label: "Serre", icon: Sprout },
      { href: "/autonomy", label: "Routine", icon: Bot },
    ],
  },
  {
    label: "Configurer",
    items: [
      { href: "/client", label: "Clients et projets", icon: Building2 },
      { href: "/local-technique", label: "Local technique", icon: Plug },
      { href: "/settings", label: "Paramètres", icon: SettingsIcon },
    ],
  },
] as const;

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-[100dvh] w-64 flex-col border-r border-border bg-card transition-transform duration-200 ease-in-out md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 text-primary">
            <Tent className="w-6 h-6" />
            <div>
              <h1 className="font-serif font-bold text-lg leading-none tracking-tight">Publisher</h1>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Observatoire & local technique</span>
            </div>
          </div>
          <button
            className="-mr-2 -mt-2 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        {NAV_GROUPS.map((group) => (
          <section key={group.label} className="mb-6 last:mb-0">
            <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.items.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-mono text-sm transition-all group",
                        isActive
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                      onClick={onClose}
                    >
                      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "group-hover:text-foreground")} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <OctopusWitness />
        <p className="mb-2 text-xs text-muted-foreground">Poulpe Fiction reste l’entrée principale pour parler à Gérard et suivre les parcelles.</p>
        <a
          href="https://poulpe-fiction.onrender.com"
          target="_blank"
          rel="noreferrer"
          className="block rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center font-mono text-xs text-primary hover:bg-primary/10"
        >
          Ouvrir Poulpe Fiction
        </a>
      </div>
    </aside>
  );
}
