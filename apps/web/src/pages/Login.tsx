import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { Button, Card, ErrorBox, Field, Input, PageHeader } from "../components/ui";

export function LoginPage() {
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/app" replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <PageHeader title="Sign in" subtitle="Invitation-only IT services CRM. Public self-registration is disabled." />
      <Card>
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
          <Field label="Email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-sm">
          <Link className="text-brand-700 hover:underline" to="/forgot-password">
            Forgot password
          </Link>
        </p>
      </Card>
    </div>
  );
}
