import Link from "next/link";
import { ClipboardList, Hotel, Inbox, Siren } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-wash">
      <header className="sticky top-0 z-20 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/inbox" className="flex items-center gap-3 font-bold text-ink">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
              <Hotel size={19} />
            </span>
            <span className="text-lg">Concierge Court</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link className="icon-button" href="/inbox">
              <Inbox size={16} />
              Inbox
            </Link>
            <Link className="icon-button" href="/ops">
              <Siren size={16} />
              Ops
            </Link>
            <span className="hidden items-center gap-2 text-sm font-semibold text-muted sm:flex">
              <ClipboardList size={16} />
              Demo Desk
            </span>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
