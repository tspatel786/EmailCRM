import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, CalendarClock, ListTodo, Mail, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fmtDateTime, money } from "../lib/format";
import { Card, CardHeader, Empty, Skeleton, cn } from "./ui";

/* Read-only dashboard widgets. Every query is a plain SELECT through the normal
   client, so RLS applies exactly as on the list pages; nothing is written. */

const STAGES = ["new_lead", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"] as const;
const stageColor: Record<string, string> = {
  new_lead: "bg-ink-300",
  contacted: "bg-sky-400",
  qualified: "bg-violet-400",
  proposal_sent: "bg-primary-400",
  negotiation: "bg-primary-600",
  won: "bg-emerald-500",
  lost: "bg-rose-400",
};
const label = (s: string) => s.replace(/_/g, " ");

type Props = {
  orgId: string;
  userId: string | undefined;
  scopeToMe: boolean;
  email: { queued: number; sent: number; failed: number } | undefined;
  /** Campaign email stats are only visible to owner/admin/sales manager. */
  showEmail?: boolean;
};

export function DashboardWidgets({ orgId, userId, scopeToMe, email, showEmail = true }: Props) {
  const widgets = useQuery({
    queryKey: ["dashboard-widgets", orgId, scopeToMe],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mine = (q: any) => (scopeToMe && userId ? q.eq("owner_user_id", userId) : q);
      const [deals, tasks, meetings, activities] = await Promise.all([
        mine(supabase.from("deals").select("stage, estimated_value").eq("organization_id", orgId)),
        mine(
          supabase
            .from("tasks")
            .select("id, title, due_at, priority, status, contacts(full_name)")
            .eq("organization_id", orgId)
            .in("status", ["pending", "in_progress"])
            .not("due_at", "is", null)
            .order("due_at", { ascending: true })
            .limit(6),
        ),
        mine(
          supabase
            .from("meetings")
            .select("id, title, starts_at, location, contacts(full_name)")
            .eq("organization_id", orgId)
            .eq("status", "scheduled")
            .gte("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(5),
        ),
        supabase
          .from("activities")
          .select("id, activity_type, summary, occurred_at, contact_id, contacts(full_name)")
          .eq("organization_id", orgId)
          .order("occurred_at", { ascending: false })
          .limit(8),
      ]);
      const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
      const dealRows = (deals.data ?? []) as { stage: string; estimated_value: number | null }[];
      const pipeline = STAGES.map((stage) => {
        const rows = dealRows.filter((d) => d.stage === stage);
        return { stage, count: rows.length, value: rows.reduce((s, d) => s + Number(d.estimated_value || 0), 0) };
      });
      type Named = { full_name?: string } | { full_name?: string }[] | null;
      return {
        pipeline,
        totalDeals: dealRows.length,
        tasks: ((tasks.data ?? []) as { id: string; title: string; due_at: string; priority: string; status: string; contacts: Named }[]).map((t) => ({
          ...t,
          contact: one(t.contacts)?.full_name,
        })),
        meetings: ((meetings.data ?? []) as { id: string; title: string; starts_at: string; location: string | null; contacts: Named }[]).map((m) => ({
          ...m,
          contact: one(m.contacts)?.full_name,
        })),
        activities: ((activities.data ?? []) as { id: string; activity_type: string; summary: string; occurred_at: string; contact_id: string | null; contacts: Named }[]).map(
          (a) => ({ ...a, contact: one(a.contacts)?.full_name }),
        ),
      };
    },
  });

  const d = widgets.data;
  const emailTotal = email ? email.queued + email.sent + email.failed : 0;
  const pct = (n: number) => (emailTotal ? Math.round((n / emailTotal) * 100) : 0);
  const maxStage = Math.max(1, ...(d?.pipeline.map((p) => p.count) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Sales pipeline */}
        <Card className={showEmail ? "xl:col-span-2" : "xl:col-span-3"}>
          <CardHeader
            title="Sales pipeline"
            subtitle={d ? `${d.totalDeals} deals across stages` : "Deals by stage"}
            icon={<TrendingUp size={16} />}
            actions={<ViewAll to="/app/deals" />}
          />
          {widgets.isLoading ? (
            <WidgetSkeleton rows={4} />
          ) : !d?.totalDeals ? (
            <Empty title="No deals yet" hint="Deals you create will appear here by stage." />
          ) : (
            <>
              <div className="mb-5 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" aria-hidden>
                {d.pipeline
                  .filter((p) => p.count)
                  .map((p) => (
                    <div key={p.stage} className={cn("h-full", stageColor[p.stage])} style={{ width: `${(p.count / d.totalDeals) * 100}%` }} />
                  ))}
              </div>
              <ul className="space-y-2.5">
                {d.pipeline.map((p) => (
                  <li key={p.stage} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[130px_1fr_120px]">
                    <span className="flex items-center gap-2 capitalize text-ink-600 dark:text-ink-300">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", stageColor[p.stage])} />
                      <span className="truncate">{label(p.stage)}</span>
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <span className={cn("block h-full rounded-full", stageColor[p.stage])} style={{ width: `${(p.count / maxStage) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold text-ink-900 dark:text-white">{p.count}</span>
                      <span className="ml-2 hidden text-xs text-ink-500 sm:inline dark:text-ink-400">{money(p.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Email activity (from the dashboard's existing counts) */}
        {showEmail ? (
        <Card>
          <CardHeader title="Email activity" subtitle="Campaign email jobs" icon={<Mail size={16} />} actions={<ViewAll to="/app/campaigns" />} />
          {!email ? (
            <WidgetSkeleton rows={3} />
          ) : !emailTotal ? (
            <Empty title="No campaign emails yet" />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-display text-3xl font-bold tracking-tight text-ink-900 tabular-nums dark:text-white">{emailTotal}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">total email jobs</p>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800" aria-hidden>
                <div className="bg-emerald-500" style={{ width: `${pct(email.sent)}%` }} />
                <div className="bg-sky-400" style={{ width: `${pct(email.queued)}%` }} />
                <div className="bg-rose-400" style={{ width: `${pct(email.failed)}%` }} />
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  { k: "SMTP accepted", v: email.sent, c: "bg-emerald-500" },
                  { k: "Queued", v: email.queued, c: "bg-sky-400" },
                  { k: "Failed / bounced", v: email.failed, c: "bg-rose-400" },
                ].map((r) => (
                  <li key={r.k} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
                      <span className={cn("h-2 w-2 rounded-full", r.c)} />
                      {r.k}
                    </span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-ink-900 dark:text-white">{r.v}</span>
                      <span className="ml-1.5 text-xs text-ink-400 dark:text-ink-500">{pct(r.v)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Follow-ups */}
        <Card>
          <CardHeader title="Follow-up reminders" subtitle="Next open tasks by due date" icon={<ListTodo size={16} />} actions={<ViewAll to="/app/follow-ups" />} />
          {widgets.isLoading ? (
            <WidgetSkeleton rows={4} />
          ) : !d?.tasks.length ? (
            <Empty title="No open follow-ups" />
          ) : (
            <ul className="-mx-1 divide-y divide-ink-100 dark:divide-ink-800">
              {d.tasks.map((t) => {
                const overdue = new Date(t.due_at) < new Date();
                return (
                  <li key={t.id} className="flex items-start gap-3 px-1 py-2.5">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", overdue ? "bg-rose-500" : t.priority === "high" ? "bg-primary-500" : "bg-ink-300")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{t.title}</p>
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                        {t.contact ? `${t.contact} · ` : ""}
                        <span className={overdue ? "font-medium text-rose-600 dark:text-rose-400" : ""}>{overdue ? "Overdue · " : ""}{fmtDateTime(t.due_at)}</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Meetings */}
        <Card>
          <CardHeader title="Upcoming meetings" subtitle="Scheduled, soonest first" icon={<CalendarClock size={16} />} actions={<ViewAll to="/app/meetings" />} />
          {widgets.isLoading ? (
            <WidgetSkeleton rows={3} />
          ) : !d?.meetings.length ? (
            <Empty title="No upcoming meetings" />
          ) : (
            <ul className="space-y-2">
              {d.meetings.map((m) => {
                const dt = new Date(m.starts_at);
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg border border-ink-100 p-2.5 dark:border-ink-800">
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/20">
                      <span className="text-2xs font-semibold uppercase leading-none">{dt.toLocaleDateString([], { month: "short" })}</span>
                      <span className="font-display text-base font-bold leading-tight">{dt.getDate()}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{m.title}</p>
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                        {dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {m.contact ? ` · ${m.contact}` : ""}
                        {m.location ? ` · ${m.location}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader title="Recent activity" subtitle="Latest CRM timeline events" icon={<Activity size={16} />} />
          {widgets.isLoading ? (
            <WidgetSkeleton rows={5} />
          ) : !d?.activities.length ? (
            <Empty title="No recent activity" />
          ) : (
            <ol className="relative space-y-3.5 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-ink-200 dark:before:bg-ink-700">
              {d.activities.map((a) => (
                <li key={a.id} className="relative flex gap-3 pl-0">
                  <span className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white bg-primary-500 ring-1 ring-primary-200 dark:border-ink-900 dark:ring-primary-500/30" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-ink-800 dark:text-ink-200">{a.summary}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                      <span className="capitalize">{label(a.activity_type)}</span>
                      {a.contact ? (
                        <>
                          {" · "}
                          {a.contact_id ? (
                            <Link to={`/app/contacts/${a.contact_id}`} className="font-medium text-ink-700 hover:text-primary-700 dark:text-ink-300 dark:hover:text-primary-300">
                              {a.contact}
                            </Link>
                          ) : (
                            a.contact
                          )}
                        </>
                      ) : null}
                      {" · "}
                      {fmtDateTime(a.occurred_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10">
      View all <ArrowRight size={13} />
    </Link>
  );
}

function WidgetSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
