import { Link } from "@tanstack/react-router";
import { Plus, Zap } from "lucide-react";
import { accounts } from "@/lib/portfolio";

const nav = [
  { to: "/", label: "Command" },
  { to: "/venues", label: "Venues" },
  { to: "/reports", label: "Reports" },
] as const;

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
          <span className="grid h-5 w-5 place-items-center rounded-sm bg-primary text-[11px] text-primary-foreground">P</span>
          POLYBASE
        </Link>
        <nav className="flex gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: true }}
              className="rounded-sm px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden items-center gap-3 font-mono text-[11px] md:flex">
            {accounts.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gain" />
                {a.venue}: <span className="text-foreground">Connected</span>
              </span>
            ))}
          </div>
          <Link to="/venues" className="flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] hover:bg-accent">
            <Plus className="h-3 w-3" /> Add Venue
          </Link>
          <span className="flex items-center gap-1 rounded-sm bg-primary px-2 py-1 font-mono text-[11px] font-semibold text-primary-foreground">
            <Zap className="h-3 w-3" /> PRO
          </span>
        </div>
      </div>
    </header>
  );
}

export function VenueBadge({ venue }: { venue: "Polymarket" | "Kalshi" }) {
  return venue === "Polymarket" ? (
    <span className="rounded-sm border border-poly/40 bg-poly/10 px-1.5 py-px font-mono text-[10px] text-poly">POLY</span>
  ) : (
    <span className="rounded-sm border border-kalshi/40 bg-kalshi/10 px-1.5 py-px font-mono text-[10px] text-kalshi">KALSHI</span>
  );
}

export function Pnl({ v, className = "" }: { v: number; className?: string }) {
  const s = Math.abs(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return <span className={`num ${v >= 0 ? "text-gain" : "text-loss"} ${className}`}>{v >= 0 ? "+" : "−"}{s}</span>;
}
