import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Card, CardHeader, Empty } from "../ui";

const axis = { fontSize: 11, fill: "#64748b" };
const tooltipStyle = { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 };

type Point = { name: string; n: number };

export function SimpleBar({ title, subtitle, data, color, horizontal }: { title: string; subtitle?: string; data: Point[]; color: string; horizontal?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={<BarChart3 size={16} />} />
      {!data.length ? <Empty title="No data yet" /> : (
        <div className={horizontal ? "h-[300px]" : "h-[230px]"}>
          <ResponsiveContainer width="100%" height="100%">
            {horizontal ? (
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={axis} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
                <Bar dataKey="n" name="Companies" fill={color} radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={tooltipStyle} />
                <Bar dataKey="n" name="Count" fill={color} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/** Lead Finder charts from the lead_finder_breakdown view (counts only rows the viewer may see). */
export function LeadCharts({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["lead-breakdown", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_finder_breakdown").select("dimension, label, companies").eq("organization_id", orgId);
      if (error) throw error;
      const by = (d: string) => (data ?? []).filter((r) => r.dimension === d).map((r) => ({ name: r.label as string, n: r.companies as number }));
      return {
        months: by("registered_month").sort((a, b) => a.name.localeCompare(b.name)).slice(-12),
        days: by("imported_day").sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ ...d, name: d.name.slice(5) })),
        states: by("state").sort((a, b) => b.n - a.n).slice(0, 10),
        industries: by("industry").sort((a, b) => b.n - a.n),
        crm: by("crm_status").map((d) => ({ ...d, name: d.name === "in_pipeline" ? "In pipeline" : d.name === "saved" ? "Saved" : "New" })),
      };
    },
  });
  if (q.isLoading || q.error || !q.data) return null;
  const d = q.data;
  if (!d.states.length) return null;
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <SimpleBar title="Companies by registration month" subtitle="From the imported government data" data={d.months} color="#f59e0b" />
      <SimpleBar title="Companies imported per day" subtitle="Last 30 days" data={d.days} color="#0ea5e9" />
      <SimpleBar title="Top states" data={d.states} color="#1e293b" horizontal />
      <SimpleBar title="Industries" subtitle="From NIC activity code" data={d.industries} color="#8b5cf6" horizontal />
    </div>
  );
}
