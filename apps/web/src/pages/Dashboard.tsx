import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { startOfMonth } from "date-fns";
import { canAdmin } from "@crm/shared";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { downloadMultiSheetWorkbook } from "../lib/export";
import { DashboardWidgets } from "../components/DashboardWidgets";
import { money } from "../lib/format";
import { Button, Card, CardHeader, Empty, ErrorBox, Input, PageHeader, Skeleton, StatCard, TableWrap, type BadgeTone } from "../components/ui";
import {
  Users,
  CheckCircle2,
  UserPlus,
  PhoneCall,
  Phone,
  Clock,
  AlertTriangle,
  Send,
  MailCheck,
  AlertCircle,
  Calendar,
  Receipt,
  Trophy,
  XCircle,
  TrendingUp,
  Download,
  LayoutDashboard,
  BarChart3,
} from "lucide-react";

type Counts = {
  leads: number;
  customers: number;
  newThisMonth: number;
  callsToday: number;
  callsMonth: number;
  followToday: number;
  followOverdue: number;
  queued: number;
  sent: number;
  failed: number;
  meetings: number;
  openQuotes: number;
  won: number;
  lost: number;
  pipeline: number;
};

export function DashboardPage() {
  const { org, user } = useSession();
  const orgId = org?.organization_id;
  const isAdmin = canAdmin(org?.role);
  const [from, setFrom] = useState(startOfMonth(new Date()).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [myDataOnly, setMyDataOnly] = useState(false);
  const scopeToMe = isAdmin && myDataOnly;

  const query = useQuery({
    queryKey: ["dashboard", orgId, from, to, scopeToMe],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<{ counts: Counts; sources: { name: string; n: number }[]; statuses: { name: string; n: number }[]; people: { name: string; calls: number }[] }> => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);
      const month0 = startOfMonth(new Date()).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scoped = (q: any) => (scopeToMe ? q.eq("owner_user_id", user!.id) : q);

      const [leads, customers, newMonth, contacts] = await Promise.all([
        scoped(supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("lifecycle", "lead").is("archived_at", null)),
        scoped(supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("lifecycle", "customer").is("archived_at", null)),
        scoped(supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("created_at", month0).is("archived_at", null)),
        scoped(supabase.from("contacts").select("lead_source, lead_status").eq("organization_id", orgId!).is("archived_at", null)),
      ]);

      const [callsToday, callsMonth, followToday, followOverdue] = await Promise.all([
        scoped(supabase.from("calls").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("called_at", today0.toISOString())),
        scoped(supabase.from("calls").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("called_at", month0)),
        scoped(
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId!)
            .in("status", ["pending", "in_progress"])
            .gte("due_at", today0.toISOString())
            .lt("due_at", new Date(today0.getTime() + 86400000).toISOString()),
        ),
        scoped(
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId!)
            .in("status", ["pending", "in_progress"])
            .lt("due_at", today0.toISOString()),
        ),
      ]);

      const [queued, sent, failed, meetings, openQuotes, deals] = await Promise.all([
        // email_jobs are campaign-level (no owner_user_id column), so they stay org-wide.
        supabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "queued"),
        supabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "sent"),
        supabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).in("status", ["failed", "dead_letter", "bounced"]),
        scoped(supabase.from("meetings").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "scheduled").gte("starts_at", new Date().toISOString())),
        scoped(supabase.from("quotations").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).in("status", ["draft", "pending_approval", "approved", "sent"])),
        scoped(supabase.from("deals").select("stage, estimated_value, owner_id").eq("organization_id", orgId!)),
      ]);

      const dealRows: { stage: string; estimated_value: number; owner_id: string | null }[] = deals.data ?? [];
      const pipeline = dealRows.filter((d) => !["won", "lost"].includes(d.stage)).reduce((s, d) => s + Number(d.estimated_value || 0), 0);
      const won = dealRows.filter((d) => d.stage === "won").length;
      const lost = dealRows.filter((d) => d.stage === "lost").length;

      const sourceMap = new Map<string, number>();
      const statusMap = new Map<string, number>();
      for (const c of contacts.data ?? []) {
        sourceMap.set(c.lead_source || "Unknown", (sourceMap.get(c.lead_source || "Unknown") ?? 0) + 1);
        statusMap.set(c.lead_status, (statusMap.get(c.lead_status) ?? 0) + 1);
      }

      const { data: callPeople } = await supabase
        .from("calls")
        .select("employee_id")
        .eq("organization_id", orgId!)
        .gte("called_at", start)
        .lte("called_at", end);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name");
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.id]));
      const peopleMap = new Map<string, number>();
      for (const row of callPeople ?? []) {
        peopleMap.set(row.employee_id, (peopleMap.get(row.employee_id) ?? 0) + 1);
      }

      return {
        counts: {
          leads: leads.count ?? 0,
          customers: customers.count ?? 0,
          newThisMonth: newMonth.count ?? 0,
          callsToday: callsToday.count ?? 0,
          callsMonth: callsMonth.count ?? 0,
          followToday: followToday.count ?? 0,
          followOverdue: followOverdue.count ?? 0,
          queued: queued.count ?? 0,
          sent: sent.count ?? 0,
          failed: failed.count ?? 0,
          meetings: meetings.count ?? 0,
          openQuotes: openQuotes.count ?? 0,
          won,
          lost,
          pipeline,
        },
        sources: [...sourceMap.entries()].map(([name, n]) => ({ name, n })),
        statuses: [...statusMap.entries()].map(([name, n]) => ({ name, n })),
        people: [...peopleMap.entries()].map(([id, calls]) => ({ name: names.get(id) || id, calls })),
      };
    },
  });

  const c = query.data?.counts;

  type Tile = { label: string; value: string | number; icon: typeof Users; tone: BadgeTone };
  const groups: { title: string; tiles: Tile[] }[] = c
    ? [
        {
          title: "Leads & customers",
          tiles: [
            { label: "Total Leads", value: c.leads, icon: Users, tone: "blue" },
            { label: "Active Customers", value: c.customers, icon: CheckCircle2, tone: "green" },
            { label: "New Leads (Month)", value: c.newThisMonth, icon: UserPlus, tone: "amber" },
          ],
        },
        {
          title: "Calls & follow-ups",
          tiles: [
            { label: "Calls Logged Today", value: c.callsToday, icon: PhoneCall, tone: "teal" },
            { label: "Calls This Month", value: c.callsMonth, icon: Phone, tone: "teal" },
            { label: "Follow-ups Today", value: c.followToday, icon: Clock, tone: "amber" },
            { label: "Overdue Tasks", value: c.followOverdue, icon: AlertTriangle, tone: "rose" },
            { label: "Upcoming Meetings", value: c.meetings, icon: Calendar, tone: "violet" },
          ],
        },
        {
          title: "Email delivery",
          tiles: [
            { label: "Emails Queued", value: c.queued, icon: Send, tone: "blue" },
            { label: "SMTP Accepted", value: c.sent, icon: MailCheck, tone: "green" },
            { label: "Emails Failed", value: c.failed, icon: AlertCircle, tone: "rose" },
          ],
        },
        {
          title: "Sales",
          tiles: [
            { label: "Open Quotations", value: c.openQuotes, icon: Receipt, tone: "violet" },
            { label: "Won Deals", value: c.won, icon: Trophy, tone: "green" },
            { label: "Lost Deals", value: c.lost, icon: XCircle, tone: "slate" },
            { label: "Pipeline Value", value: money(c.pipeline), icon: TrendingUp, tone: "amber" },
          ],
        },
      ]
    : [];

  function exportAnalytics() {
    if (!c) return;
    const kpis = [
      { "Sr No": 1, "Metric": "Total Leads", "Value": c.leads, "Period": `${from} to ${to}` },
      { "Sr No": 2, "Metric": "Active Customers", "Value": c.customers, "Period": `${from} to ${to}` },
      { "Sr No": 3, "Metric": "New Leads This Month", "Value": c.newThisMonth, "Period": "Current Month" },
      { "Sr No": 4, "Metric": "Calls Logged Today", "Value": c.callsToday, "Period": "Today" },
      { "Sr No": 5, "Metric": "Calls Logged This Month", "Value": c.callsMonth, "Period": "Current Month" },
      { "Sr No": 6, "Metric": "Follow-ups Due Today", "Value": c.followToday, "Period": "Today" },
      { "Sr No": 7, "Metric": "Overdue Follow-ups", "Value": c.followOverdue, "Period": "All Overdue" },
      { "Sr No": 8, "Metric": "Emails Queued (Outbox)", "Value": c.queued, "Period": "Live Queue" },
      { "Sr No": 9, "Metric": "Emails Accepted (SMTP)", "Value": c.sent, "Period": `${from} to ${to}` },
      { "Sr No": 10, "Metric": "Emails Delivery Failed", "Value": c.failed, "Period": `${from} to ${to}` },
      { "Sr No": 11, "Metric": "Upcoming Meetings", "Value": c.meetings, "Period": "Scheduled" },
      { "Sr No": 12, "Metric": "Open Quotations", "Value": c.openQuotes, "Period": "Active" },
      { "Sr No": 13, "Metric": "Deals Won", "Value": c.won, "Period": `${from} to ${to}` },
      { "Sr No": 14, "Metric": "Deals Lost", "Value": c.lost, "Period": `${from} to ${to}` },
      { "Sr No": 15, "Metric": "Total Pipeline Value", "Value": money(c.pipeline), "Period": "Open Pipeline" },
    ];
    const sources = (query.data?.sources ?? []).map((s, idx) => ({
      "Sr No": idx + 1,
      "Lead Source": s.name || "Unknown",
      "Total Leads": s.n,
    }));
    const statuses = (query.data?.statuses ?? []).map((s, idx) => ({
      "Sr No": idx + 1,
      "Lead Status": s.name ? s.name.toUpperCase().replace("_", " ") : "Unknown",
      "Count": s.n,
    }));
    const team = (query.data?.people ?? []).map((p, idx) => ({
      "Sr No": idx + 1,
      "Team Member": p.name,
      "Calls Completed": p.calls,
    }));
    downloadMultiSheetWorkbook(`SMPatel_Dashboard_${from}_to_${to}.xlsx`, [
      { name: "KPI Summary", rows: kpis },
      { name: "Lead Sources", rows: sources },
      { name: "Lead Statuses", rows: statuses },
      { name: "Team Activity", rows: team },
    ]);
  }

  const chartAxis = { fontSize: 12, fill: "#64748b" };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live figures from PostgreSQL via RLS. Email “sent” means SMTP accepted, not inbox delivery."
        icon={<LayoutDashboard size={20} />}
        actions={
          <>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input type="date" aria-label="From date" className="min-w-0 flex-1 sm:w-[150px] sm:flex-none" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-xs text-ink-400">to</span>
              <Input type="date" aria-label="To date" className="min-w-0 flex-1 sm:w-[150px] sm:flex-none" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            {isAdmin ? (
              <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 shadow-sm transition hover:border-ink-300">
                <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={myDataOnly} onChange={(e) => setMyDataOnly(e.target.checked)} />
                My data only
              </label>
            ) : null}
            <Button variant="secondary" onClick={exportAnalytics}>
              <Download size={16} /> Export Analytics
            </Button>
          </>
        }
      />
      {query.isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-card" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-[300px] rounded-card" />
            <Skeleton className="h-[300px] rounded-card" />
          </div>
        </div>
      ) : query.error ? (
        <ErrorBox message={`Could not load dashboard: ${(query.error as Error).message}`} />
      ) : (
        <div className="space-y-6">
          {(() => {
            // Columns sized to each group's tile count so no group leaves an empty gap.
            const cols: Record<number, string> = {
              3: "grid-cols-2 sm:grid-cols-3",
              4: "grid-cols-2 lg:grid-cols-4",
              5: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
            };
            const section = (g: (typeof groups)[number]) => (
              <section key={g.title} className="min-w-0">
                <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{g.title}</h2>
                <div className={`grid gap-3 ${cols[g.tiles.length] ?? cols[5]}`}>
                  {g.tiles.map((t) => (
                    <StatCard key={t.label} label={t.label} value={t.value} tone={t.tone} icon={<t.icon size={16} />} />
                  ))}
                </div>
              </section>
            );
            const [leads, calls, mail, sales] = groups;
            return (
              <>
                <div className="grid gap-6 xl:grid-cols-2">
                  {leads ? section(leads) : null}
                  {mail ? section(mail) : null}
                </div>
                {calls ? section(calls) : null}
                {sales ? section(sales) : null}
              </>
            );
          })()}

          {orgId ? (
            <DashboardWidgets
              orgId={orgId}
              userId={user?.id}
              scopeToMe={scopeToMe}
              email={c ? { queued: c.queued, sent: c.sent, failed: c.failed } : undefined}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Leads by source" subtitle="Active contacts grouped by lead source" icon={<BarChart3 size={16} />} />
              {query.data?.sources.length ? (
                <div className="h-[220px] sm:h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={query.data.sources} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                      <XAxis dataKey="name" tick={chartAxis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                      <YAxis allowDecimals={false} tick={chartAxis} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
                      <Bar dataKey="n" name="Leads" fill="#f59e0b" radius={[6, 6, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty title="No contacts yet" />
              )}
            </Card>
            <Card>
              <CardHeader title="Leads by status" subtitle="Pipeline stage of active contacts" icon={<BarChart3 size={16} />} />
              {query.data?.statuses.length ? (
                <div className="h-[220px] sm:h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={query.data.statuses} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                      <XAxis dataKey="name" tick={chartAxis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                      <YAxis allowDecimals={false} tick={chartAxis} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
                      <Bar dataKey="n" name="Contacts" fill="#1e293b" radius={[6, 6, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty title="No status data" />
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Employee call volume in range" subtitle={`${from} to ${to}`} icon={<PhoneCall size={16} />} />
            {query.data?.people.length ? (
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th className="text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.people.map((p) => (
                      <tr key={p.name}>
                        <td className="font-medium text-ink-900">{p.name}</td>
                        <td className="text-right tabular-nums">{p.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <Empty title="No calls in this date range" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 24px -8px rgb(15 23 42 / 0.15)",
  fontSize: 12,
};
