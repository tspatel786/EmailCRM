import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./lib/session";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
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

function Protected({ children }: { children: ReactElement }) {
  const { session, loading, memberships } = useSession();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!session) return <Navigate to="/login" replace />;
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
