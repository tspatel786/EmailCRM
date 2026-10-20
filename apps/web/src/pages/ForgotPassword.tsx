import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ThreeBackground } from "../components/ThreeBackground";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, Mail, Sparkles } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden overflow-y-auto">
      <ThreeBackground />
      <div className="fixed inset-0 pointer-events-none z-[1] bg-[radial-gradient(circle_at_center,transparent_20%,rgba(7,11,20,0.65)_100%)]" />

      <div className="relative z-10 w-full max-w-[420px] mx-auto py-6">
        <div className="mb-5 text-center">
          <div className="relative inline-block mb-1 group">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-amber-500/30 via-cyan-400/20 to-purple-500/20 blur-xl opacity-75" />
            <img
              src="/logo.png"
              alt="S.M.PATEL IT HUB"
              className="relative h-16 w-auto mx-auto object-contain drop-shadow-[0_10px_25px_rgba(245,158,11,0.35)]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "/favicon.png";
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-amber-300/90 font-medium">
            <Sparkles size={12} className="text-amber-400" />
            <span>Password Recovery</span>
          </div>
        </div>

        <div className="rounded-2xl sm:rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 sm:p-7 backdrop-blur-xl shadow-2xl shadow-black/90">
          <div className="mb-4 border-b border-slate-800/80 pb-3">
            <h1 className="text-base sm:text-lg font-bold text-white font-['Space_Grotesk'] tracking-wide">
              Reset Your Password
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your work email and we will send you a reset link
            </p>
          </div>

          {sent ? (
            <div className="text-center py-4 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-sm text-slate-200">
                If <strong className="text-amber-400">{email}</strong> is registered, a password reset link has been sent.
              </p>
              <p className="text-xs text-slate-400">
                Please check your inbox or spam folder.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:underline pt-2"
              >
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/reset-password`,
                });
                setBusy(false);
                if (err) setError(err.message);
                else setSent(true);
              }}
            >
              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs text-rose-300 font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Work Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail size={15} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sales@smpatelithub.in"
                    required
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-800/70 pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="shimmer-btn-fx w-full mt-1.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                {busy ? "Sending Link…" : "Send Reset Link"} <ArrowRight size={15} />
              </button>

              <div className="pt-2 text-center">
                <Link
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition"
                  to="/login"
                >
                  <ArrowLeft size={13} /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden overflow-y-auto">
      <ThreeBackground />
      <div className="fixed inset-0 pointer-events-none z-[1] bg-[radial-gradient(circle_at_center,transparent_20%,rgba(7,11,20,0.65)_100%)]" />

      <div className="relative z-10 w-full max-w-[420px] mx-auto py-6">
        <div className="rounded-2xl sm:rounded-3xl border border-slate-700/60 bg-slate-900/80 p-5 sm:p-7 backdrop-blur-xl shadow-2xl shadow-black/90">
          <div className="mb-4 border-b border-slate-800/80 pb-3">
            <h1 className="text-base sm:text-lg font-bold text-white font-['Space_Grotesk'] tracking-wide">
              Set New Password
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter your new secure password (minimum 8 characters)
            </p>
          </div>

          {done ? (
            <div className="text-center py-4 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-sm text-slate-200">
                Your password has been successfully updated.
              </p>
              <Link
                to="/login"
                className="shimmer-btn-fx inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs"
              >
                Sign In Now <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                const { error: err } = await supabase.auth.updateUser({ password });
                setBusy(false);
                if (err) setError(err.message);
                else setDone(true);
              }}
            >
              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs text-rose-300 font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock size={15} />
                  </div>
                  <input
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    required
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-800/70 pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 focus:outline-none transition shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="shimmer-btn-fx w-full mt-1.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                {busy ? "Updating…" : "Update Password"} <ArrowRight size={15} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
