"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  ClipboardList,
  FileSearch,
  Hotel,
  Inbox,
  MessageSquareText,
  PanelLeft,
  Settings,
  ShieldCheck,
  Siren
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AgentRuntimeBadge } from "@/components/AgentRuntimeBadge";
import { cn } from "@/lib/utils";

const primaryNav = [
  { href: "/inbox", label: "Command center", icon: Inbox },
  { href: "/inbox", label: "Conversations", icon: MessageSquareText },
  { href: "/ops", label: "Ops board", icon: Siren }
];

const managementNav = [
  { label: "Agent activity", icon: Activity, value: "Live" },
  { label: "Reports", icon: ClipboardList, value: "Soon" },
  { label: "Policies", icon: FileSearch, value: "Demo" },
  { label: "Settings", icon: Settings, value: "Soon" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCaseRoute = pathname.startsWith("/case");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-white">
            <Hotel size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Concierge Court</div>
            <div className="text-xs font-medium text-muted-foreground">AI operations desk</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <AgentRuntimeBadge className="mb-4" />

          <nav className="grid gap-1">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = (item.href === "/inbox" && (pathname === "/inbox" || isCaseRoute)) || (item.href === "/ops" && pathname === "/ops");
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    active && "bg-primary/10 text-primary"
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Separator className="my-4" />

          <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">Manager tools</div>
          <div className="grid gap-1">
            {managementNav.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex h-9 items-center justify-between rounded-md px-2.5 text-sm text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Icon size={16} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="text-[11px] font-semibold">{item.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border p-3">
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <ShieldCheck size={14} />
              Human control
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Drafts, escalations, and takeovers stay visible before guest impact.</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-card lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/inbox" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-white">
              <Hotel size={17} />
            </span>
            Concierge Court
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="Open inbox">
              <Link href="/inbox">
                <PanelLeft size={16} />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="View ops board">
              <Link href="/ops">
                <Bell size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
