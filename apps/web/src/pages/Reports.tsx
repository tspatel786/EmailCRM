import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { startOfMonth } from "date-fns";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { downloadWorkbook, downloadMultiSheetWorkbook } from "../lib/export";
import { Button, Card, PageHeader } from "../components/ui";

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
        title="Reports"
        subtitle="Filtered to your organization through RLS."
        actions={
          <>
            <input type="date" className="rounded-lg border px-2 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="rounded-lg border px-2 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
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
              Export Report
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
              Failed Emails
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
              Activity Log
            </Button>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-500">Conversion (customers / new contacts in range)</p>
          <p className="text-2xl font-semibold">{d?.conversion ?? 0}%</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Calls</p>
          <p className="text-2xl font-semibold">{d?.calls.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Failed emails</p>
          <p className="text-2xl font-semibold">{d?.failedJobs.length ?? 0}</p>
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="mb-2 font-medium">Lead sources in range</h2>
        <ul className="text-sm">
          {Object.entries(
            (d?.contacts ?? []).reduce<Record<string, number>>((acc, c) => {
              const k = c.lead_source || "Unknown";
              acc[k] = (acc[k] ?? 0) + 1;
              return acc;
            }, {}),
          ).map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
