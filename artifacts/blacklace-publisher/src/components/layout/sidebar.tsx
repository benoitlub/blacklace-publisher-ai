import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  FileText,
  Megaphone,
  Users,
  Plug,
  Settings as SettingsIcon,
  Tent,
  Building2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client", label: "Espace Client", icon: Building2 },
  { href: "/calendar", label: "Calendrier", icon: CalendarIcon },
  { href: "/posts", label: "Publications", icon: FileText },
  { href: "/campaigns", label: "Campagnes", icon: Megaphone },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/connectors", label: "Connecteurs", icon: Plug },
  { href: "/settings", label: "Paramètres", icon: SettingsIcon },
];

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
              <h1 className="font-serif font-bold text-lg leading-none tracking-tight">Feuch Institute</h1>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Blacklace Publisher</span>
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
      
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md font-mono text-sm transition-all cursor-pointer group",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
                )}
                onClick={onClose}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "group-hover:text-foreground")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-border">
        <div className="text-xs font-mono text-muted-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
          Système Opérationnel
        </div>
      </div>
    </aside>
  );
}
