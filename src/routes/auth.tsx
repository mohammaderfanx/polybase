import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PolyBase" },
      { name: "description", content: "Sign in to your PolyBase cross-venue prediction market terminal." },
      { property: "og:title", content: "Sign in — PolyBase" },
      { property: "og:description", content: "Sign in to your PolyBase cross-venue prediction market terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && nav({ to: "/" }));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => s && nav({ to: "/" }));
    return () => data.subscription.unsubscribe();
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) setMsg("Check your email to confirm your account.");
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setMsg(r.error.message);
  };

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="panel w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 font-mono text-sm font-bold">
          <span className="grid h-5 w-5 place-items-center rounded-sm bg-primary text-[11px] text-primary-foreground">P</span>
          POLYBASE
        </div>
        <h1 className="text-lg font-semibold">{mode === "in" ? "Sign in" : "Create account"}</h1>
        <button onClick={google} className="w-full rounded-sm border px-3 py-2 font-mono text-xs hover:bg-accent">Continue with Google</button>
        <form onSubmit={submit} className="space-y-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email"
            className="num w-full rounded-sm border bg-background px-2 py-2 text-xs outline-none focus:border-primary" />
          <input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password"
            className="num w-full rounded-sm border bg-background px-2 py-2 text-xs outline-none focus:border-primary" />
          <button disabled={busy} className="w-full rounded-sm bg-primary px-3 py-2 font-mono text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {mode === "in" ? "Sign in" : "Sign up"}
          </button>
        </form>
        {msg && <p className="text-xs text-warn">{msg}</p>}
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-xs text-muted-foreground hover:text-foreground">
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
