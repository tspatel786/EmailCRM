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
    <div className="relative min-h-screen bg-[#070b14] flex flex-col justify-between p-3 sm:p-5 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden overflow-y-auto">
      {/* Interactive 3D Animated Background (Three.js with colorful floating shapes & parallax) */}
      <ThreeBackground />

      {/* Subtle radial vignette overlay */}
      <div className="fixed inset-0 pointer-events-none z-[1] bg-[radial-gradient(circle_at_center,transparent_20%,rgba(7,11,20,0.65)_100%)]" />

      {/* Top Navbar */}
      <header className="relative z-10 flex items-center justify-between max-w-5xl mx-auto w-full py-1.5 sm:py-2">
        <a
          href="https://smpatelithub.in"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors group"
        >
          <div className="p-1 rounded-lg bg-slate-900/80 border border-amber-400/30 shadow-md backdrop-blur-md group-hover:border-amber-400/60 transition">
            <Globe size={14} />
          </div>
          <span className="tracking-tight font-medium">smpatelithub.in</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-300">
            <MapPin size={12} className="text-amber-400" /> Solapur, MH
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-semibold text-amber-300 border border-amber-400/30 shadow-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Enterprise CRM
          </span>
        </div>
      </header>

      {/* Center 3D-Card Container */}
      <main className="relative z-10 w-full max-w-[420px] mx-auto my-auto py-2 sm:py-4">
        {/* Brand Header with Glowing 3D Emblem */}
        <div className="mb-4 sm:mb-5 text-center">
          <div className="relative inline-block mb-1 group">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-amber-500/30 via-cyan-400/20 to-purple-500/20 blur-xl opacity-75 group-hover:opacity-100 transition duration-500" />
            <img
              src="/logo.png"
              alt="S.M.PATEL IT HUB"
              className="relative h-16 sm:h-20 w-auto mx-auto object-contain drop-shadow-[0_10px_25px_rgba(245,158,11,0.35)] transition-transform duration-300 hover:scale-105"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-amber-300/90 font-medium">
            <Sparkles size={12} className="text-amber-400" />
            <span>Client Relationship & Sales Portal</span>
          </div>
        </div>

        {/* Glassmorphic Login Card */}
        <div className="rounded-2xl sm:rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 sm:p-7 backdrop-blur-xl shadow-2xl shadow-black/90 transition-all duration-300 hover:border-slate-600/80">
          <div className="mb-4 border-b border-slate-800/80 pb-3">
            <h1 className="text-base sm:text-lg font-bold text-white font-['Space_Grotesk'] tracking-wide">
              Sign In to Your Account
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your work email and password to continue
            </p>
          </div>

          <form
            className="space-y-3.5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const { error: err } = await supabase.auth.signInWithPassword({ email, password });
              setBusy(false);
              if (err) {
                setError(
                  err.message === "Invalid login credentials"
                    ? "Invalid email or password. Please check and try again."
                    : err.message
                );
              }
            }}
          >
            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-300 font-medium animate-in fade-in duration-200">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User size={15} />
                </div>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/70 pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={15} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-800/70 pl-9 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-amber-400 transition cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="shimmer-btn-fx w-full mt-1.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer select-none"
            >
              {busy ? "Authenticating…" : "Login"} <ArrowRight size={15} />
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800/80">
            <Link className="text-amber-400 hover:underline hover:text-amber-300 transition" to="/forgot-password">
              Forgot Password?
            </Link>
            <a
              href="mailto:sales@smpatelithub.in?subject=New%20CRM%20Account%20Request"
              className="text-amber-400 hover:underline hover:text-amber-300 transition font-medium"
              title="Request a new CRM user account from your administrator"
            >
              Create Account
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-4xl mx-auto w-full py-2.5 text-center text-[11px] sm:text-xs text-slate-400 border-t border-slate-800/60 mt-2">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mb-1">
          <a href="tel:+919096427821" className="flex items-center gap-1.5 text-slate-300 hover:text-amber-400 transition">
            <Phone size={12} className="text-amber-400" /> +91 90964 27821
          </a>
          <a href="mailto:sales@smpatelithub.in" className="flex items-center gap-1.5 text-slate-300 hover:text-amber-400 transition">
            <Mail size={12} className="text-amber-400" /> sales@smpatelithub.in
          </a>
          <a
            href="https://smpatelithub.in"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-amber-400 hover:underline hover:text-amber-300 transition"
          >
            <Globe size={12} /> smpatelithub.in
          </a>
        </div>
        <div className="text-slate-500 text-[10px] sm:text-[11px]">
          © {new Date().getFullYear()} S.M.PATEL IT HUB • Solapur, Maharashtra • All rights reserved.
        </div>
      </footer>
    </div>
  );
}
