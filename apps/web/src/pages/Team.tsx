import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { canAdmin, canInviteRole, ROLES, type AppRole } from "@crm/shared";
import { useSession } from "../lib/session";
import { invokeFunction, supabase } from "../lib/supabase";
import { Button, Card, Empty, Field, Input, Modal, PageHeader, Select } from "../components/ui";

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
      return data;
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!canInviteRole(org!.role, role as AppRole)) throw new Error("You cannot assign that role");
      return invokeFunction("invite-member", {
        organizationId: org!.organization_id,
        email,
        full_name: fullName,
        role,
      });
    },
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  return (
    <div>
      <PageHeader title="Team" subtitle="Public signup is disabled. Members join by invite only." actions={admin ? <Button onClick={() => setOpen(true)}>+ Invite Member</Button> : null} />
      {!members.data?.length ? (
        <Empty title="No members visible" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Name</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {members.data.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2">{(m.profiles as { full_name?: string } | null)?.full_name}</td>
                  <td>{m.role}</td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={invite.isPending}>
            Send invite
          </Button>
          {invite.error ? <p className="text-sm text-rose-700">{(invite.error as Error).message}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
