import { useQuery } from "@tanstack/react-query";
import { canViewAudit } from "@crm/shared";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDateTime } from "../lib/format";
import { Card, Empty, PageHeader } from "../components/ui";

export function AuditLogsPage() {
  const { org } = useSession();
  const allowed = canViewAudit(org?.role);
  const logs = useQuery({
    queryKey: ["audit", org?.organization_id],
    enabled: Boolean(org) && allowed,
    queryFn: async () =>
      (await supabase.from("audit_logs").select("*").eq("organization_id", org!.organization_id).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  if (!allowed) return <Empty title="Audit logs are limited to owner, admin, and sales manager roles." />;

  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Security-sensitive actions. Email bodies and passwords are never stored here." />
      {!logs.data?.length ? (
        <Empty title="No audit events" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">When</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2">{fmtDateTime(l.created_at)}</td>
                  <td>{l.action}</td>
                  <td>
                    {l.entity_table} {l.entity_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
