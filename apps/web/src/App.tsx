import { useState, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./lib/session";
import { AppShell } from "./components/AppShell";
import { Button, Spinner } from "./components/ui";
import { supabase } from "./lib/supabase";
import { LoginPage } from "./pages/Login";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/ForgotPassword";
import { DashboardPage } from "./pages/Dashboard";
import { CompaniesPage } from "./pages/Companies";
import { ContactsPage } from "./pages/Contacts";
import { ContactDetailPage } from "./pages/ContactDetail";
import { ImportExcelPage } from "./pages/ImportExcel";
import { CallsPage } from "./pages/Calls";
import { FollowUpsPage } from "./pages/FollowUps";
import { CampaignDetailPage, CampaignsPage } from "./pages/Campaigns";
import { MailsPage } from "./pages/Mails";
import { TemplatesPage } from "./pages/Templates";
import { DealsPage } from "./pages/Deals";
import { QuotationsPage } from "./pages/Quotations";
import { MeetingsPage } from "./pages/Meetings";
import { ProjectsPage } from "./pages/Projects";
import { ReportsPage } from "./pages/Reports";
import { TeamPage } from "./pages/Team";
import { SettingsPage } from "./pages/Settings";
import { AuditLogsPage } from "./pages/AuditLogs";
import { UnsubscribePage } from "./pages/Unsubscribe";
import { PublicInquiryPage } from "./pages/PublicInquiry";

function PendingInvites() {
  const { invites, refresh, setOrgId } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function accept(organizationId: string) {
    setBusy(organizationId);
    setError("");
    const { error: rpcError } = await supabase.rpc("accept_invite", { p_organization_id: organizationId });
    if (rpcError) {
      setError(rpcError.message);
      setBusy(null);
      return;
    }
    setOrgId(organizationId);
    await refresh();
    setBusy(null);
  }

  return (
    <div className="mx-auto max-w-md p-8 text-center text-sm text-slate-700">
      <h1 className="mb-2 text-lg font-semibold text-slate-900">You have a pending invitation</h1>
      <p className="mb-4">Accept it to join the organization.</p>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span>
              Role: <strong>{inv.role}</strong>
            </span>
            <Button disabled={busy !== null} onClick={() => void accept(inv.organization_id)}>
              {busy === inv.organization_id ? "Accepting..." : "Accept invite"}
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-red-600">{error}</p> : null}
    </div>
  );
}

function Protected({ children }: { children: ReactElement }) {
  const { session, loading, memberships, invites } = useSession();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!memberships.length && invites.length) return <PendingInvites />;
  if (!memberships.length) {
    return (
      <div className="p-8 text-center text-sm text-slate-600">
        This account has no organization membership. Ask an owner to invite you. Public self-registration as admin is disabled.
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />
      <Route path="/inquiry/:orgSlug" element={<PublicInquiryPage />} />
      <Route
        path="/app"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="import" element={<ImportExcelPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="mails" element={<MailsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="quotations" element={<QuotationsPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="audit" element={<AuditLogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
