import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { ThreeBackground } from "../components/ThreeBackground";
import { Globe, Phone, Mail, MapPin, ShieldCheck, ArrowRight, Eye, EyeOff, Lock, User, Sparkles } from "lucide-react";

export function LoginPage() {
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/app" replace />;

  return (
    <div className="relative min-h-screen bg-[#070b14] flex flex-col justify-between p-4 sm:p-6 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 overflow-hidden">
      {/* Interactive 3D Animated Background (Three.js with colorful floating shapes & parallax) */}
      <ThreeBackground />

      {/* Subtle radial vignette overlay */}
      <div className="fixed inset-0 pointer-events-none z-[1] bg-[radial-gradient(circle_at_center,transparent_20%,rgba(7,11,20,0.6)_100%)]" />

      {/* Top Navbar */}
      <header className="relative z-10 flex items-center justify-between max-w-6xl mx-auto w-full py-2 sm:py-3">
        <a
          href="https://smpatelithub.in"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
        >
          <div className="p-1.5 rounded-xl bg-slate-900/80 border border-amber-400/30 shadow-md backdrop-blur-md">
            <Globe size={15} />
          </div>
          <span className="tracking-tight font-medium">smpatelithub.in</span>
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-300">
            <MapPin size={13} className="text-amber-400" /> Solapur, Maharashtra
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 backdrop-blur-md px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-400/30 shadow-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Enterprise CRM
          </span>
        </div>
      </header>

      {/* Center 3D-Card Container */}
      <main className="relative z-10 w-full max-w-md mx-auto my-auto py-4 sm:py-6">
        {/* Brand Header with Glowing 3D-Halo Emblem */}
        <div className="mb-6 text-center">
          <div className="relative inline-block mb-3">
            <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-amber-500/40 via-cyan-400/20 to-purple-500/30 blur-lg opacity-80 animate-pulse-glow" />
            <div className="relative inline-flex p-3 rounded-2xl bg-white/95 shadow-2xl border border-slate-700/60 backdrop-blur-md transition-transform duration-300 hover:scale-105">
              <img
                src="/logo.png"
                alt="S.M.PATEL IT HUB"
                className="h-13 sm:h-15 w-auto max-w-[190px] object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/favicon.png";
                }}
              />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Space_Grotesk']">
            S.M.PATEL IT HUB
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-300 flex items-center justify-center gap-1.5">
            <Sparkles size={13} className="text-amber-400" />
            <span>Enterprise Client Relationship & Sales Management</span>
          </p>
        </div>

        {/* Glassmorphic Login Card */}
        <div className="rounded-3xl border border-slate-700/60 bg-slate-900/75 p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/90 transition-all duration-300 hover:border-slate-700/80">
          <div className="mb-5 border-b border-slate-800/80 pb-4">
            <h2 className="text-base sm:text-lg font-bold text-white font-['Space_Grotesk']">
              Sign In to CRM Portal
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your authorized email and password to access the portal
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
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-xs sm:text-sm text-rose-300 font-medium animate-in fade-in duration-200">
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
                  placeholder="name@company.com"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/60 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition shadow-inner"
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
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/60 pl-10 pr-11 py-3 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-amber-400 transition cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="shimmer-btn-fx w-full mt-2 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3.5 rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer select-none"
            >
              {busy ? "Authenticating…" : "Login"} <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-800/80">
            <Link className="text-amber-400 hover:underline hover:text-amber-300 transition" to="/forgot-password">
              Forgot Password?
            </Link>
            <a
              href="mailto:sales@smpatelithub.in?subject=New%20CRM%20Account%20Request"
              className="text-amber-400 hover:underline hover:text-amber-300 transition"
              title="Request a new CRM user account from your administrator"
            >
              Create Account
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl mx-auto w-full py-3 text-center text-xs text-slate-400 border-t border-slate-800/60 mt-4">
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-1.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Phone size={13} className="text-amber-400" /> +91 90964 27821
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
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
        <div className="text-slate-500">
          © {new Date().getFullYear()} S.M.PATEL IT HUB • Solapur, Maharashtra, India • All rights reserved.
        </div>
      </footer>
    </div>
  );
}
