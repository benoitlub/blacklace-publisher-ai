import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground dark">
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer le menu"
        />
      )}

      <header className="fixed top-0 left-0 right-0 z-10 flex h-12 items-center justify-center border-b border-border bg-card/95 px-4 backdrop-blur md:hidden">
        <button
          className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-secondary/50 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="font-serif text-base font-bold leading-none text-foreground">Feuch Institute</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Système opérationnel
          </div>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex min-h-[100dvh] flex-col md:pl-64">
        <div className="flex-1 px-4 pb-6 pt-16 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
