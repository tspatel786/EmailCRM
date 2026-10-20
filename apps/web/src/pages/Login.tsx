import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Button, Card, ErrorBox, Field, Input } from "../components/ui";
import { Globe, Phone, Mail, MapPin, ShieldCheck, ArrowRight } from "lucide-react";

export function LoginPage() {
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/app" replace />;

  const handleQuickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("DemoPass123!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-between p-4 sm:p-6 text-slate-100">
      {/* Top bar with website link */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full py-2">
        <a
          href="https://smpatelithub.in"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs sm:text-sm font-medium text-amber-400 hover:text-amber-300 transition"
        >
          <Globe size={16} />
          <span>smpatelithub.in</span>
        </a>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="hidden sm:inline flex items-center gap-1">
            <MapPin size={12} className="text-amber-400" /> Solapur, Maharashtra
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-400/20">
            <ShieldCheck size={12} /> Enterprise CRM
          </span>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="mx-auto w-full max-w-md my-auto">
        <div className="mb-6 text-center">
          <div className="inline-block p-2 rounded-2xl bg-white shadow-xl shadow-amber-500/5 mb-3 border border-slate-700">
            <img
              src="/logo.png"
              alt="S.M.PATEL IT HUB Logo"
              className="h-16 w-auto max-w-[220px] object-contain mx-auto"
              onError={(e) => {
                // fallback to favicon if logo fails
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-['Space_Grotesk']">
            S.M.PATEL IT HUB
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Enterprise Client Relationship & Mail Management System
          </p>
        </div>

        <Card className="bg-slate-900/90 border-slate-800 backdrop-blur-md shadow-2xl p-6 text-slate-100">
          <div className="mb-5 border-b border-slate-800 pb-4">
            <h2 className="text-base font-semibold text-white">Sign In to Workspace</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Secure access for authorized S.M.PATEL IT HUB executives & partners
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const { error: err } = await supabase.auth.signInWithPassword({ email, password });
              setBusy(false);
              if (err) setError(err.message);
            }}
          >
            {error ? <ErrorBox message={error} /> : null}

            <Field label="Work Email">
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sales@smpatelithub.in"
                required
                className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus:border-amber-400 focus:ring-amber-400"
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus:border-amber-400 focus:ring-amber-400"
              />
            </Field>

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold shadow-lg shadow-amber-500/20 py-2.5 transition"
            >
              {busy ? "Authenticating…" : "Sign In to CRM"} <ArrowRight size={16} />
            </Button>
          </form>

          {/* Quick Login helper buttons */}
          <div className="mt-5 border-t border-slate-800 pt-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2">
              Quick Select Account:
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemo("sales@smpatelithub.in")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-400/20 transition"
              >
                <Mail size={12} /> S.M.Patel Sales
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo("owner@demo.local")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition"
              >
                Demo Owner
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60">
            <Link className="text-amber-400 hover:underline" to="/forgot-password">
              Forgot password?
            </Link>
            <a
              href="mailto:sales@smpatelithub.in"
              className="text-slate-400 hover:text-slate-300"
            >
              Need access? Contact Admin
            </a>
          </div>
        </Card>
      </div>

      {/* Footer details from smpatelithub.in */}
      <footer className="max-w-5xl mx-auto w-full py-4 text-center text-xs text-slate-500 border-t border-slate-800/60 mt-6">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-2">
          <span className="flex items-center gap-1 text-slate-400">
            <Phone size={12} className="text-amber-400" /> +91 90964 27821
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Mail size={12} className="text-amber-400" /> sales@smpatelithub.in / info@smpatelithub.in
          </span>
          <a
            href="https://smpatelithub.in"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-amber-400 hover:underline"
          >
            <Globe size={12} /> www.smpatelithub.in
          </a>
        </div>
        <div>
          © {new Date().getFullYear()} S.M.PATEL IT HUB • Solapur, Maharashtra, India • All rights reserved.
        </div>
      </footer>
    </div>
  );
}
