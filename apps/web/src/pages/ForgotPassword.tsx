import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Card, Field, Input, PageHeader } from "../components/ui";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="mb-4 text-center">
        <div className="inline-block p-2 rounded-2xl bg-white shadow-md border border-slate-200 mb-2">
          <img src="/logo.png" alt="S.M.PATEL IT HUB" className="h-12 w-auto mx-auto object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/favicon.png"; }} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 font-['Space_Grotesk']">S.M.PATEL IT HUB</h2>
      </div>
      <PageHeader title="Reset password" subtitle="We will email a reset link if the account exists." />
      <Card>
        {sent ? (
          <p className="text-sm text-slate-600">If that address is registered, a reset email is on its way.</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setSent(true);
            }}
          >
            <Field label="Work Email">
              <Input type="email" placeholder="sales@smpatelithub.in" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold">
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm text-center">
          <Link className="text-amber-600 font-medium hover:underline" to="/login">
            ← Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <PageHeader title="Choose a new password" />
      <Card>
        {done ? (
          <p className="text-sm">
            Password updated. <Link to="/login">Sign in</Link>
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase.auth.updateUser({ password });
              if (!error) setDone(true);
            }}
          >
            <Field label="New password">
              <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full">
              Update password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
