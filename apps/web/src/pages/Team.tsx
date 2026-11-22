import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { canAdmin, canInviteRole, ROLES, type AppRole } from "@crm/shared";
import { useSession } from "../lib/session";
import { invokeFunction, supabase } from "../lib/supabase";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, TableSkeleton, TableWrap } from "../components/ui";
import { Shield as ShieldIcon } from "lucide-react";

const statusTone: Record<string, "green" | "amber" | "slate"> = {
  active: "green",
  invited: "amber",
};

export function TeamPage() {
  const { org } = useSession();
  const admin = canAdmin(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("sales_executive");

  const members = useQuery({
    queryKey: ["team", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("id, role, status, user_id, profiles(full_name)")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      // Separate query: still works before the Lead Finder migration exists.
      const { data: flags } = await supabase.from("memberships").select("id, lead_finder_access").eq("organization_id", org!.organization_id);
      const f = new Map((flags ?? []).map((x) => [x.id as string, Boolean((x as { lead_finder_access?: boolean }).lead_finder_access)]));
      return data.map((m) => ({ ...m, lead_finder_access: f.get(m.id) ?? false, lead_flag_supported: Boolean(flags) }));
    },
  });

  const toggleLead = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("memberships").update({ lead_finder_access: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["team"] }),
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!canInviteRole(org!.role, role as AppRole)) throw new Error("You cannot assign that role");
      return invokeFunction("invite-member", {
        organizationId: org!.organization_id,
        email: email.trim(),
        full_name: fullName.trim(),
        role,
      });
    },
    onSuccess: () => {
      setOpen(false);
      setEmail("");
      setFullName("");
      setRole("sales_executive");
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (err) => {
      console.error("Invite member failed:", err);
    },
  });

  return (
    <div>
      <PageHeader
        title="Team" icon={<ShieldIcon size={20} />}
        subtitle="Public signup is disabled. Members join by invite only."
        actions={
          admin ? (
            <Button
              onClick={() => {
                invite.reset();
                setOpen(true);
              }}
            >
              + Invite Member
            </Button>
          ) : null
        }
      />
      {members.isLoading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : !members.data?.length ? (
        <Empty title="No members visible" />
      ) : (
        <Card>
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th title="Lead Finder and Decision Maker Finder">Lead Finder access</th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-2">{(m.profiles as { full_name?: string } | null)?.full_name}</td>
                    <td>
                      <Badge tone="blue">{m.role}</Badge>
                    </td>
                    <td>
                      <Badge tone={statusTone[m.status] ?? "slate"}>{m.status}</Badge>
                    </td>
                    <td>
                      {m.role === "owner" || m.role === "admin" ? (
                        <span className="text-xs text-ink-500 dark:text-ink-400">Always</span>
                      ) : admin && m.lead_flag_supported ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary-500"
                            checked={m.lead_finder_access}
                            disabled={toggleLead.isPending}
                            onChange={(e) => toggleLead.mutate({ id: m.id, value: e.target.checked })}
                          />
                          {m.lead_finder_access ? "On" : "Off"}
                        </label>
                      ) : (
                        <span className="text-xs text-ink-500 dark:text-ink-400">{m.lead_finder_access ? "On" : "Off"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
      <Modal open={open} title="Invite member" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          {invite.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30">
              {(invite.error as Error).message}
            </div>
          ) : null}

          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="e.g. Rahul Sharma" />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="user@example.com" />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={invite.isPending} className="w-full">
            {invite.isPending ? "Sending invite..." : "Send invite"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
