import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, CalendarDays, MapPin, ShieldCheck, Sparkles, Star, Wifi } from "lucide-react";
import { CallButton } from "./CallAgent";

export default function Home() {
  return (
    <main className="relative h-[100svh] w-screen overflow-hidden bg-[#111816] text-white">
      <img
        src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1800&q=82"
        alt="Luxury hotel terrace with pool and palm trees"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[#111816]/45" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/65 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 to-transparent" />

      <section className="relative z-10 flex h-full min-h-0 flex-col px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-white/70">Solveo Hotels</p>
            <h1 className="truncate text-2xl font-bold tracking-normal sm:text-3xl">Aurora Bay Resort</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur-md">
              <Star size={16} className="fill-[#f7c948] text-[#f7c948]" />
              4.9
            </div>
            <Link
              href="/inbox"
              className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur-md transition hover:bg-white/25"
            >
              <ShieldCheck size={16} />
              Admin
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 items-center py-6 sm:py-8">
          <div className="w-full max-w-3xl">
            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full bg-white/16 px-3 py-2 text-sm font-semibold backdrop-blur-md">
              <MapPin size={16} />
              <span className="truncate">Beachfront stays in quiet suites</span>
            </div>
            <h2 className="max-w-2xl text-4xl font-bold leading-[1.05] tracking-normal sm:text-6xl lg:text-7xl">
              Your room, view, and concierge in one calm place.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/85 sm:text-lg">
              Check your stay details, browse amenities, and ask for help from the guest desk without waiting in line.
            </p>

            <div className="mt-6 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
              <StayStat icon={<CalendarDays size={17} />} label="Tonight" value="Suite 302" />
              <StayStat icon={<Wifi size={17} />} label="Included" value="Fast Wi-Fi" />
              <StayStat icon={<Bell size={17} />} label="Service" value="24/7 desk" />
            </div>
          </div>
        </div>

        <div className="shrink-0 pb-1">
          <div className="mb-4 flex max-w-4xl items-center justify-between gap-3 rounded-[8px] border border-white/20 bg-white/12 p-3 backdrop-blur-md">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-normal text-white/65">Featured stay</p>
              <p className="truncate text-sm font-semibold sm:text-base">Pool view king suite, late checkout available</p>
            </div>
            <span className="hidden shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-bold text-[#182026] sm:inline-flex">
              <Sparkles size={15} />
              Live demo
            </span>
          </div>
          <CallButton />
        </div>
      </section>
    </main>
  );
}

function StayStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-white/20 bg-white/14 p-3 backdrop-blur-md">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#182026]">{icon}</div>
      <p className="truncate text-xs font-bold uppercase tracking-normal text-white/65">{label}</p>
      <p className="truncate text-sm font-bold sm:text-base">{value}</p>
    </div>
  );
}
