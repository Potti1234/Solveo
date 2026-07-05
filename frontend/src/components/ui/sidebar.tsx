import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div data-sidebar-open={open} className="flex min-h-[100dvh] bg-zinc-50 text-zinc-950">
      <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>
    </div>
  );
}

const SidebarContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside SidebarProvider");
  return context;
}

export function Sidebar({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { open } = useSidebar();
  return (
    <aside
      className={cn(
        "hidden min-h-[100dvh] shrink-0 border-r border-zinc-200 bg-white transition-[width] duration-300 md:block",
        open ? "w-80" : "w-16",
        className
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex h-16 items-center gap-2 border-b border-zinc-200 px-4", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-zinc-200 p-3", className)} {...props} />;
}

export function SidebarTrigger() {
  const { open, setOpen } = useSidebar();
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Toggle sidebar">
      <Icon className="h-4 w-4" />
    </Button>
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <main className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />;
}
