import { lazy, Suspense, useState, type ReactElement } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApplyTheme } from "./lib/theme";
import { useSession } from "./lib/session";
import { AppShell } from "./components/AppShell";
import { Button, Spinner } from "./components/ui";
import { supabase } from "./lib/supabase";
import { LoginPage } from "./pages/Login";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/ForgotPassword";
import { UnsubscribePage } from "./pages/Unsubscribe";
import { PublicInquiryPage } from "./pages/PublicInquiry";

// App pages are code-split so the login page and first screen load fast; each page's code
// (and heavy libraries such as charts and Excel) downloads only when it is opened.
const DashboardPage = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })));
const CompaniesPage = lazy(() => import("./pages/Companies").then((m) => ({ default: m.CompaniesPage })));
const ContactsPage = lazy(() => import("./pages/Contacts").then((m) => ({ default: m.ContactsPage })));
const ContactDetailPage = lazy(() => import("./pages/ContactDetail").then((m) => ({ default: m.ContactDetailPage })));
const ImportExcelPage = lazy(() => import("./pages/ImportExcel").then((m) => ({ default: m.ImportExcelPage })));
const CallsPage = lazy(() => import("./pages/Calls").then((m) => ({ default: m.CallsPage })));
const FollowUpsPage = lazy(() => import("./pages/FollowUps").then((m) => ({ default: m.FollowUpsPage })));
const MailsPage = lazy(() => import("./pages/Mails").then((m) => ({ default: m.MailsPage })));
const TemplatesPage = lazy(() => import("./pages/Templates").then((m) => ({ default: m.TemplatesPage })));
const DealsPage = lazy(() => import("./pages/Deals").then((m) => ({ default: m.DealsPage })));
const QuotationsPage = lazy(() => import("./pages/Quotations").then((m) => ({ default: m.QuotationsPage })));
const PaymentsPage = lazy(() => import("./pages/Payments").then((m) => ({ default: m.PaymentsPage })));
const MeetingsPage = lazy(() => import("./pages/Meetings").then((m) => ({ default: m.MeetingsPage })));
const ProjectsPage = lazy(() => import("./pages/Projects").then((m) => ({ default: m.ProjectsPage })));
const ReportsPage = lazy(() => import("./pages/Reports").then((m) => ({ default: m.ReportsPage })));
const TeamPage = lazy(() => import("./pages/Team").then((m) => ({ default: m.TeamPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })));
const AuditLogsPage = lazy(() => import("./pages/AuditLogs").then((m) => ({ default: m.AuditLogsPage })));
const LeadFinderPage = lazy(() => import("./pages/LeadFinder").then((m) => ({ default: m.LeadFinderPage })));
const DecisionMakersPage = lazy(() => import("./pages/DecisionMakers").then((m) => ({ default: m.DecisionMakersPage })));
const CampaignsPage = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.CampaignsPage })));
const CampaignDetailPage = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.CampaignDetailPage })));


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
  const { pathname } = useLocation();
  const { loading, session, memberships } = useSession();
  // Dark mode only inside the authenticated app; redirects, invite/no-org screens and
  // public pages stay light.
  useApplyTheme(pathname.startsWith("/app") && (loading || (!!session && memberships.length > 0)));
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
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="lead-finder" element={<LeadFinderPage />} />
        <Route path="decision-makers" element={<DecisionMakersPage />} />
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
