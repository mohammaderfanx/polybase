import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accountsQ } from "@/lib/queries";

const nav = [
  { to: "/", label: "Command" },
  { to: "/venues", label: "Venues" },
  { to: "/reports", label: "Reports" },
] as const;

export function AppHeader() {
  const { data: accounts = [] } = useQuery(accountsQ);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/auth" });
  };
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
          <span className="grid h-5 w-5 place-items-center rounded-sm bg-primary text-[11px] text-primary-foreground">P</span>
          POLYBASE
        </Link>
        <nav className="flex gap-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: true }}
              className="rounded-sm px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="hidden items-center gap-3 font-mono text-[11px] md:flex">
            {(["Polymarket", "Kalshi"] as const).map((v) => {
              const acc = accounts.filter((a) => a.venue === v);
              const err = acc.some((a) => a.status === "error");
              return (
                <span key={v} className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${!acc.length ? "bg-muted-foreground" : err ? "bg-loss" : "bg-gain animate-pulse"}`} />
                  {v}: <span className="text-foreground">{!acc.length ? "None" : err ? "Error" : "Connected"}</span>
                </span>
              );
            })}
          </div>
          <Link to="/venues" className="flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[11px] hover:bg-accent">
            <Plus className="h-3 w-3" /> Add Venue
          </Link>
          <button onClick={signOut} aria-label="Sign out" className="text-muted-foreground hover:text-foreground"><LogOut className="h-3.5 w-3.5" /></button>
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
