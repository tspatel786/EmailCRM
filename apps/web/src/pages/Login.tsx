import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Globe, Phone, Mail, MapPin, ShieldCheck, ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";

export function LoginPage() {
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/app" replace />;

  const handleQuickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("DemoPass123!");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#070b14] relative flex flex-col justify-between p-4 sm:p-6 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Background ambient gradient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-amber-500/10 blur-[130px] rounded-full" />
        <div className="absolute -bottom-40 right-10 w-[500px] h-[400px] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 flex items-center justify-between max-w-6xl mx-auto w-full py-3">
        <a
          href="https://smpatelithub.in"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
        >
          <div className="p-1 rounded-md bg-amber-400/10 border border-amber-400/20">
            <Globe size={15} />
          </div>
          <span>smpatelithub.in</span>
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin size={13} className="text-amber-400" /> Solapur, Maharashtra
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-400/25 shadow-sm">
            <ShieldCheck size={13} className="text-amber-400" /> Enterprise CRM
          </span>
        </div>
      </header>

      {/* Center Login Container */}
      <main className="relative z-10 w-full max-w-md mx-auto my-auto py-6">
        {/* Brand header */}
        <div className="mb-6 text-center">
          <div className="inline-flex p-2.5 rounded-2xl bg-white shadow-xl shadow-amber-500/10 mb-3 border border-slate-700/60 transition-transform hover:scale-105 duration-200">
            <img
              src="/logo.png"
              alt="S.M.PATEL IT HUB"
              className="h-14 sm:h-16 w-auto max-w-[200px] object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Space_Grotesk']">
            S.M.PATEL IT HUB
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Enterprise Client Relationship & Sales Management
          </p>
        </div>

        {/* Login Box */}
        <div className="rounded-3xl border border-slate-800/90 bg-slate-900/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/80">
          <div className="mb-5 border-b border-slate-800/80 pb-4">
            <h2 className="text-base sm:text-lg font-bold text-white font-['Space_Grotesk']">
              Sign In to CRM Portal
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Authorized access for S.M.PATEL IT HUB staff & clients
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
            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-300 font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={16} />
                </div>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sales@smpatelithub.in"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/60 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 focus:outline-none transition shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/60 pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 focus:outline-none transition shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-amber-400 transition"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3.5 rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer select-none"
            >
              {busy ? "Authenticating…" : "Sign In to CRM"} <ArrowRight size={16} />
            </button>
          </form>

          {/* Quick Select Demo Accounts */}
          <div className="mt-5 border-t border-slate-800/80 pt-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Quick Login Access:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleQuickDemo("sales@smpatelithub.in")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/20 transition cursor-pointer"
              >
                <Mail size={12} /> S.M.Patel Sales
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo("owner@demo.local")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition cursor-pointer"
              >
                Demo Owner
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800/60">
            <Link className="text-amber-400 hover:underline hover:text-amber-300 transition" to="/forgot-password">
              Forgot password?
            </Link>
            <a
              href="mailto:sales@smpatelithub.in"
              className="text-slate-400 hover:text-slate-200 transition"
            >
              Need access? Contact Admin
            </a>
          </div>
        </div>
      </main>

      {/* Footer details from smpatelithub.in */}
      <footer className="relative z-10 max-w-5xl mx-auto w-full py-4 text-center text-xs text-slate-500 border-t border-slate-800/60 mt-4">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-2">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Phone size={13} className="text-amber-400" /> +91 9112427821
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <Mail size={13} className="text-amber-400" /> sales@smpatelithub.in / info@smpatelithub.in
          </span>
          <a
            href="https://smpatelithub.in"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-amber-400 hover:underline hover:text-amber-300 transition"
          >
            <Globe size={13} /> www.smpatelithub.in
          </a>
        </div>
        <div>
          © {new Date().getFullYear()} S.M.PATEL IT HUB • Solapur, Maharashtra, India • All rights reserved.
        </div>
      </footer>
    </div>
  );
}
