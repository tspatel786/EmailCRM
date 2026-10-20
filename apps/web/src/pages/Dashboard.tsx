import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { startOfMonth } from "date-fns";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { downloadMultiSheetWorkbook } from "../lib/export";
import { money } from "../lib/format";
import { Button, Card, Empty, PageHeader, Spinner } from "../components/ui";
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
  const { org } = useSession();
  const orgId = org?.organization_id;
  const [from, setFrom] = useState(startOfMonth(new Date()).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const query = useQuery({
    queryKey: ["dashboard", orgId, from, to],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<{ counts: Counts; sources: { name: string; n: number }[]; statuses: { name: string; n: number }[]; people: { name: string; calls: number }[] }> => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);
      const month0 = startOfMonth(new Date()).toISOString();

      const [leads, customers, newMonth, contacts] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("lifecycle", "lead").is("archived_at", null),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("lifecycle", "customer").is("archived_at", null),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("created_at", month0).is("archived_at", null),
        supabase.from("contacts").select("lead_source, lead_status").eq("organization_id", orgId!).is("archived_at", null),
      ]);

      const [callsToday, callsMonth, followToday, followOverdue] = await Promise.all([
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("called_at", today0.toISOString()),
        supabase.from("calls").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).gte("called_at", month0),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .in("status", ["pending", "in_progress"])
          .gte("due_at", today0.toISOString())
          .lt("due_at", new Date(today0.getTime() + 86400000).toISOString()),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId!)
          .in("status", ["pending", "in_progress"])
          .lt("due_at", today0.toISOString()),
      ]);

      const [queued, sent, failed, meetings, openQuotes, deals] = await Promise.all([
        supabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "queued"),
        supabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "sent"),
        supabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).in("status", ["failed", "dead_letter", "bounced"]),
        supabase.from("meetings").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).eq("status", "scheduled").gte("starts_at", new Date().toISOString()),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("organization_id", orgId!).in("status", ["draft", "pending_approval", "approved", "sent"]),
        supabase.from("deals").select("stage, estimated_value, owner_id").eq("organization_id", orgId!),
      ]);

      const dealRows = deals.data ?? [];
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

  const tiles = c
    ? [
        { label: "Total Leads", value: c.leads, icon: Users, color: "text-blue-600 bg-blue-50 border-blue-200" },
        { label: "Active Customers", value: c.customers, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
        { label: "New Leads (Month)", value: c.newThisMonth, icon: UserPlus, color: "text-amber-600 bg-amber-50 border-amber-200" },
        { label: "Calls Logged Today", value: c.callsToday, icon: PhoneCall, color: "text-teal-600 bg-teal-50 border-teal-200" },
        { label: "Calls This Month", value: c.callsMonth, icon: Phone, color: "text-cyan-600 bg-cyan-50 border-cyan-200" },
        { label: "Follow-ups Today", value: c.followToday, icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
        { label: "Overdue Tasks", value: c.followOverdue, icon: AlertTriangle, color: "text-rose-600 bg-rose-50 border-rose-200" },
        { label: "Emails Queued", value: c.queued, icon: Send, color: "text-sky-600 bg-sky-50 border-sky-200" },
        { label: "SMTP Accepted", value: c.sent, icon: MailCheck, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
        { label: "Emails Failed", value: c.failed, icon: AlertCircle, color: "text-rose-600 bg-rose-50 border-rose-200" },
        { label: "Upcoming Meetings", value: c.meetings, icon: Calendar, color: "text-purple-600 bg-purple-50 border-purple-200" },
        { label: "Open Quotations", value: c.openQuotes, icon: Receipt, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
        { label: "Won Deals", value: c.won, icon: Trophy, color: "text-amber-600 bg-amber-50 border-amber-200" },
        { label: "Lost Deals", value: c.lost, icon: XCircle, color: "text-slate-600 bg-slate-50 border-slate-200" },
        { label: "Pipeline Value", value: money(c.pipeline), icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live figures from PostgreSQL via RLS. Email “sent” means SMTP accepted, not inbox delivery."
        actions={
          <>
            <input type="date" className="rounded-lg border px-2 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="rounded-lg border px-2 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button
              variant="secondary"
              onClick={() => {
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
              }}
            >
              Export Analytics
            </Button>
          </>
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.error ? (
        <Empty title="Could not load dashboard" hint={(query.error as Error).message} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {tiles.map((t) => (
              <Card key={t.label} className="card-hover-lift relative overflow-hidden flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.label}</span>
                  <div className={`p-2 rounded-xl border ${t.color}`}>
                    <t.icon size={16} />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 font-['Space_Grotesk']">{t.value}</p>
              </Card>
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-medium">Leads by source</h2>
              {query.data?.sources.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={query.data.sources}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="n" fill="#0f766e" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty title="No contacts yet" />
              )}
            </Card>
            <Card>
              <h2 className="mb-3 font-medium">Leads by status</h2>
              {query.data?.statuses.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={query.data.statuses}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="n" fill="#115e59" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty title="No status data" />
              )}
            </Card>
          </div>
          <Card className="mt-4">
            <h2 className="mb-3 font-medium">Employee call volume in range</h2>
            {query.data?.people.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Employee</th>
                    <th>Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.people.map((p) => (
                    <tr key={p.name} className="border-t">
                      <td className="py-2">{p.name}</td>
                      <td>{p.calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="No calls in this date range" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
