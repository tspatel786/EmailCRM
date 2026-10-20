import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { startOfMonth } from "date-fns";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { downloadWorkbook } from "../lib/export";
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
              onClick={() =>
                downloadWorkbook(`report-${from}-${to}.xlsx`, [
                  { report: "conversion_rate_percent", value: d?.conversion },
                  { report: "contacts_in_range", value: d?.contacts.length },
                  { report: "calls", value: d?.calls.length },
                  { report: "failed_emails", value: d?.failedJobs.length },
                ])
              }
            >
              Export summary
            </Button>
            <Button variant="secondary" onClick={() => downloadWorkbook("failed-emails.xlsx", (d?.failedJobs ?? []) as Record<string, unknown>[])}>
              Failed emails
            </Button>
            <Button variant="secondary" onClick={() => downloadWorkbook("activity.xlsx", (d?.activities ?? []) as Record<string, unknown>[])}>
              Activity
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
