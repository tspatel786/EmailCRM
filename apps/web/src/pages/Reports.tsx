import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { startOfMonth } from "date-fns";
import { useSession } from "../lib/session";
import { PaymentReports } from "../components/PaymentReports";
import { supabase } from "../lib/supabase";
import { fmtDateTime } from "../lib/format";
import { downloadWorkbook, downloadMultiSheetWorkbook } from "../lib/export";
import { Button, Card, PageHeader, Badge, CardHeader, Empty, ErrorBox, Input, Skeleton, StatCard, TableWrap } from "../components/ui";
import { Activity, AlertCircle, BarChart3 as BarChart3Icon, Download, Kanban, Mail, Phone, Receipt, Target, UserPlus } from "lucide-react";

export function ReportsPage() {
  const { org } = useSession();
  const [from, setFrom] = useState(startOfMonth(new Date()).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const data = useQuery({
    queryKey: ["reports", org?.organization_id, from, to],
    enabled: Boolean(org),
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59`).toISOString();
      const [contacts, calls, jobs, deals, quotes, activities] = await Promise.all([
        supabase.from("contacts").select("lead_source, lead_status, lifecycle, created_at").eq("organization_id", org!.organization_id).gte("created_at", start).lte("created_at", end),
        supabase.from("calls").select("employee_id, outcome, called_at").eq("organization_id", org!.organization_id).gte("called_at", start).lte("called_at", end),
        supabase.from("email_jobs").select("status, last_error, to_email, campaign_id").eq("organization_id", org!.organization_id).gte("created_at", start).lte("created_at", end),
        supabase.from("deals").select("stage, estimated_value, currency").eq("organization_id", org!.organization_id).gte("created_at", start).lte("created_at", end),
        supabase.from("quotations").select("status, total_amount, currency").eq("organization_id", org!.organization_id).gte("created_at", start).lte("created_at", end),
        supabase.from("activities").select("activity_type, occurred_at, summary").eq("organization_id", org!.organization_id).gte("occurred_at", start).lte("occurred_at", end).order("occurred_at"),
      ]);
      const contactRows = contacts.data ?? [];
      const customers = contactRows.filter((c) => c.lifecycle === "customer").length;
      const conversion = contactRows.length ? Math.round((customers / contactRows.length) * 100) : 0;
      return {
        contacts: contactRows,
        calls: calls.data ?? [],
        jobs: jobs.data ?? [],
        deals: deals.data ?? [],
        quotes: quotes.data ?? [],
        activities: activities.data ?? [],
        conversion,
        failedJobs: (jobs.data ?? []).filter((j) => ["failed", "dead_letter", "bounced"].includes(j.status)),
      };
    },
  });

  const d = data.data;
  return (
    <div>
      <PageHeader
        title="Reports" icon={<BarChart3Icon size={20} />}
        subtitle="Filtered to your organization through RLS."
        actions={
          <>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Input type="date" aria-label="From date" className="min-w-0 flex-1 sm:w-[150px] sm:flex-none" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-xs text-ink-400">to</span>
              <Input type="date" aria-label="To date" className="min-w-0 flex-1 sm:w-[150px] sm:flex-none" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const summary = [
                  { "Sr No": 1, "Metric": "Lead-to-Customer Conversion Rate", "Value": `${d?.conversion ?? 0}%`, "Period": `${from} to ${to}` },
                  { "Sr No": 2, "Metric": "Total Contacts Added In Range", "Value": d?.contacts.length ?? 0, "Period": `${from} to ${to}` },
                  { "Sr No": 3, "Metric": "Total Phone Calls Logged", "Value": d?.calls.length ?? 0, "Period": `${from} to ${to}` },
                  { "Sr No": 4, "Metric": "Total Deals Tracked", "Value": d?.deals.length ?? 0, "Period": `${from} to ${to}` },
                  { "Sr No": 5, "Metric": "Quotations Generated", "Value": d?.quotes.length ?? 0, "Period": `${from} to ${to}` },
                  { "Sr No": 6, "Metric": "Emails Attempted", "Value": d?.jobs.length ?? 0, "Period": `${from} to ${to}` },
                  { "Sr No": 7, "Metric": "Failed / Bounced Emails", "Value": d?.failedJobs.length ?? 0, "Period": `${from} to ${to}` },
                ];
                const sources = Object.entries(
                  (d?.contacts ?? []).reduce<Record<string, number>>((acc, c) => {
                    const k = c.lead_source || "Unknown";
                    acc[k] = (acc[k] ?? 0) + 1;
                    return acc;
                  }, {}),
                ).map(([source, count], idx) => ({
                  "Sr No": idx + 1,
                  "Lead Source": source,
                  "Count": count,
                }));
                const activities = (d?.activities ?? []).map((a, idx) => ({
                  "Sr No": idx + 1,
                  "Activity Type": a.activity_type ? a.activity_type.toUpperCase().replace("_", " ") : "",
                  "Timestamp": a.occurred_at ? new Date(a.occurred_at).toLocaleString() : "",
                  "Summary": a.summary || "",
                }));
                const failed = (d?.failedJobs ?? []).map((j, idx) => ({
                  "Sr No": idx + 1,
                  "Recipient Email": j.to_email || "",
                  "Status": j.status ? j.status.toUpperCase() : "",
                  "Error Details": j.last_error || "Unknown error",
                }));
                downloadMultiSheetWorkbook(`SMPatel_Reports_${from}_to_${to}.xlsx`, [
                  { name: "Executive Summary", rows: summary },
                  { name: "Lead Sources", rows: sources },
                  { name: "Activities", rows: activities },
                  { name: "Failed Deliveries", rows: failed },
                ]);
              }}
            >
              <Download size={16} /> Export Report
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const failed = (d?.failedJobs ?? []).map((j, idx) => ({
                  "Sr No": idx + 1,
                  "Recipient Email": j.to_email || "",
                  "Status": j.status ? j.status.toUpperCase() : "",
                  "Error Details": j.last_error || "None",
                }));
                downloadWorkbook("SMPatel_Failed_Emails.xlsx", failed, "Failed Emails");
              }}
            >
              <AlertCircle size={16} /> Failed Emails
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const activities = (d?.activities ?? []).map((a, idx) => ({
                  "Sr No": idx + 1,
                  "Activity Type": a.activity_type ? a.activity_type.toUpperCase().replace("_", " ") : "",
                  "Timestamp": a.occurred_at ? new Date(a.occurred_at).toLocaleString() : "",
                  "Summary": a.summary || "",
                }));
                downloadWorkbook("SMPatel_Activities.xlsx", activities, "Activities");
              }}
            >
              <Activity size={16} /> Activity Log
            </Button>
          </>
        }
      />
      {data.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : data.error ? (
        <ErrorBox message={`Could not load reports: ${(data.error as Error).message}`} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <StatCard label="Conversion" value={`${d?.conversion ?? 0}%`} tone="green" icon={<Target size={16} />} hint="customers / new contacts" />
            <StatCard label="Contacts added" value={d?.contacts.length ?? 0} tone="blue" icon={<UserPlus size={16} />} />
            <StatCard label="Calls" value={d?.calls.length ?? 0} tone="teal" icon={<Phone size={16} />} />
            <StatCard label="Deals tracked" value={d?.deals.length ?? 0} tone="violet" icon={<Kanban size={16} />} />
            <StatCard label="Quotations" value={d?.quotes.length ?? 0} tone="amber" icon={<Receipt size={16} />} />
            <StatCard label="Emails attempted" value={d?.jobs.length ?? 0} tone="slate" icon={<Mail size={16} />} />
            <StatCard label="Failed emails" value={d?.failedJobs.length ?? 0} tone="rose" icon={<AlertCircle size={16} />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownCard
              title="Lead sources in range"
              icon={<BarChart3Icon size={16} />}
              rows={countBy((d?.contacts ?? []).map((c) => c.lead_source || "Unknown"))}
              color="bg-primary-500"
              empty="No contacts added in this range"
            />
            <BreakdownCard
              title="Call outcomes"
              icon={<Phone size={16} />}
              rows={countBy((d?.calls ?? []).map((c) => (c.outcome || "unknown").replace(/_/g, " ")))}
              color="bg-teal-500"
              empty="No calls logged in this range"
            />
            <BreakdownCard
              title="Deal stages"
              icon={<Kanban size={16} />}
              rows={countBy((d?.deals ?? []).map((x) => (x.stage || "unknown").replace(/_/g, " ")))}
              color="bg-ink-800"
              empty="No deals created in this range"
            />
          </div>

          <Card>
            <CardHeader title="Activity in range" subtitle={`${d?.activities.length ?? 0} events · ${from} to ${to}`} icon={<Activity size={16} />} />
            {!d?.activities.length ? (
              <Empty title="No activity in this range" />
            ) : (
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Summary</th>
                      <th className="text-right">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.activities].reverse().slice(0, 50).map((a, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap">
                          <Badge tone="slate">{(a.activity_type || "").replace(/_/g, " ")}</Badge>
                        </td>
                        <td className="max-w-[520px] truncate text-ink-800 dark:text-ink-200">{a.summary}</td>
                        <td className="whitespace-nowrap text-right text-ink-500 dark:text-ink-400">{fmtDateTime(a.occurred_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>
      )}
      {org ? <div className="mt-6"><PaymentReports orgId={org.organization_id} from={from} to={to} /></div> : null}
    </div>
  );
}

function countBy(values: string[]): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
}

function BreakdownCard({
  title,
  icon,
  rows,
  color,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { label: string; n: number }[];
  color: string;
  empty: string;
}) {
  const total = rows.reduce((s, r) => s + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Card>
      <CardHeader title={title} subtitle={total ? `${total} total` : undefined} icon={icon} />
      {!rows.length ? (
        <Empty title={empty} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate capitalize text-ink-700 dark:text-ink-300">{r.label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-ink-900 dark:text-white">{r.n}</span>
                  <span className="ml-1.5 text-xs text-ink-400">{Math.round((r.n / total) * 100)}%</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(r.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
