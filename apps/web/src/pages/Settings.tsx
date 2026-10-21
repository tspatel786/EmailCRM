import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { canAdmin } from "@crm/shared";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Button, Card, Field, Input, PageHeader } from "../components/ui";

export function SettingsPage() {
  const { org, user, refresh } = useSession();
  const admin = canAdmin(org?.role);
  const [name, setName] = useState(org?.organizations.name ?? "");
  const [limit, setLimit] = useState(org?.organizations.daily_email_limit ?? 100);
  const [timezone, setTimezone] = useState(org?.organizations.timezone ?? "Asia/Kolkata");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [mfaMsg, setMfaMsg] = useState<string | null>(null);

  useEffect(() => {
    if (org?.organizations) {
      setName(org.organizations.name ?? "");
      setLimit(org.organizations.daily_email_limit ?? 100);
      setTimezone(org.organizations.timezone ?? "Asia/Kolkata");
    }
  }, [org]);

  const save = useMutation({
    mutationFn: async () => {
      setSavedSuccess(false);
      if (!org?.organization_id) throw new Error("No active organization found");
      const { error } = await supabase
        .from("organizations")
        .update({ name: name.trim(), daily_email_limit: Number(limit), timezone: timezone.trim() })
        .eq("id", org.organization_id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        organization_id: org.organization_id,
        actor_user_id: user!.id,
        action: "organization.updated",
        entity_table: "organizations",
        entity_id: org.organization_id,
        metadata: { name, daily_email_limit: limit, timezone },
      });
    },
    onSuccess: () => {
      setSavedSuccess(true);
      void refresh();
    },
  });

  async function enrollMfa() {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) {
      setMfaMsg(error.message);
      return;
    }
    setFactorId(data.id);
    setSecret(data.totp.secret);
    setMfaMsg("Scan the secret in an authenticator app, then enter a 6-digit code to verify.");
  }

  async function verifyMfa() {
    if (!factorId) return;
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) {
      setMfaMsg(cErr.message);
      return;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    setMfaMsg(error ? error.message : "TOTP factor verified for this account.");
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Tenant settings and optional TOTP MFA for privileged users. Zoho SMTP secrets are never stored here." />
      {admin ? (
        <Card className="max-w-lg space-y-3">
          {save.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(save.error as Error).message || "Failed to save settings"}
            </div>
          ) : null}
          {savedSuccess ? (
            <div className="rounded-lg bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700 border border-emerald-200">
              Settings updated successfully.
            </div>
          ) : null}
          <Field label="Organization name">
            <Input value={name} onChange={(e) => { setName(e.target.value); setSavedSuccess(false); }} />
          </Field>
          <Field label="Daily email limit">
            <Input type="number" min={1} value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setSavedSuccess(false); }} />
          </Field>
          <Field label="Timezone">
            <Input value={timezone} onChange={(e) => { setTimezone(e.target.value); setSavedSuccess(false); }} />
          </Field>
          <p className="text-sm text-slate-500">
            Retention is configured as `organizations.retention_days` in the database. Provider backups are time-limited; yearly hosting renewal does not imply indefinite data retention. See docs/BACKUP_RESTORE.md.
          </p>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </Card>
      ) : (
        <p className="text-sm text-slate-600">Only owners and admins can change organization settings.</p>
      )}
      <Card className="mt-4 max-w-lg space-y-3">
        <h2 className="font-medium">Privileged MFA (TOTP)</h2>
        <p className="text-sm text-slate-600">Enroll a TOTP factor on your Auth user. Recommended for owner and admin accounts.</p>
        <Button variant="secondary" onClick={() => void enrollMfa()}>
          Start TOTP enrollment
        </Button>
        {secret ? <p className="break-all text-sm">Secret: {secret}</p> : null}
        {factorId ? (
          <Field label="Verification code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          </Field>
        ) : null}
        {factorId ? (
          <Button type="button" onClick={() => void verifyMfa()}>
            Verify factor
          </Button>
        ) : null}
        {mfaMsg ? <p className="text-sm">{mfaMsg}</p> : null}
      </Card>
    </div>
  );
}
