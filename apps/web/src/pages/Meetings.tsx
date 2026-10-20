import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { canWrite, meetingFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDateTime } from "../lib/format";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";

type Form = z.infer<typeof meetingFormSchema>;
type Meeting = { id: string; title: string; starts_at: string; ends_at: string | null; status: string; agenda: string | null; notes: string | null; outcome: string | null; location: string | null; contact_id: string | null; company_id: string | null };

export function MeetingsPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Meeting | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: { title: "", starts_at: new Date().toISOString().slice(0, 16), status: "scheduled" },
  });

  const contacts = useQuery({
    queryKey: ["contact-options", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => (await supabase.from("contacts").select("id, full_name").eq("organization_id", org!.organization_id).is("archived_at", null)).data ?? [],
  });

  const list = useQuery({
    queryKey: ["meetings", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => (await supabase.from("meetings").select("*, contacts(full_name)").eq("organization_id", org!.organization_id).order("starts_at", { ascending: false })).data ?? [],
  });

  function openCreate() {
    setEditTarget(null);
    form.reset({ title: "", starts_at: new Date().toISOString().slice(0, 16), status: "scheduled" });
    setOpen(true);
  }

  function openEdit(m: Meeting) {
    setEditTarget(m);
    form.reset({
      title: m.title,
      starts_at: m.starts_at.slice(0, 16),
      ends_at: m.ends_at?.slice(0, 16) ?? undefined,
      status: m.status as Form["status"],
      agenda: m.agenda ?? undefined,
      notes: m.notes ?? undefined,
      outcome: m.outcome ?? undefined,
      location: m.location ?? undefined,
      contact_id: m.contact_id ?? undefined,
      company_id: m.company_id ?? undefined,
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async (values: Form) => {
      const payload = {
        ...values,
        starts_at: new Date(values.starts_at).toISOString(),
        ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
      };
      if (editTarget) {
        const { error } = await supabase.from("meetings").update(payload).eq("id", editTarget.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("meetings")
          .insert({ ...payload, organization_id: org!.organization_id, created_by: user!.id, calendar_sync_status: "not_configured" })
          .select()
          .single();
        if (error) throw error;
        if (values.contact_id) {
          await supabase.rpc("record_activity", {
            p_org: org!.organization_id,
            p_contact: values.contact_id,
            p_company: null,
            p_type: "meeting",
            p_summary: values.title,
            p_outcome: values.status,
            p_source_table: "meetings",
            p_source_id: data.id,
            p_next_follow_up: null,
          });
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      setOpen(false);
      setEditTarget(null);
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["meetings"] });
      setCancelTarget(null);
    },
  });

  const statusColors: Record<string, "teal" | "rose" | "slate" | "amber"> = {
    scheduled: "teal",
    completed: "slate",
    cancelled: "rose",
    no_show: "amber",
  };

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle="Calendar sync is not configured. ICS export is not implemented; this is in-app scheduling only."
        actions={writable ? <Button onClick={openCreate}>Schedule</Button> : null}
      />
      {!list.data?.length ? (
        <Empty title="No meetings" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Title</th>
                <th>When</th>
                <th>Client</th>
                <th>Status</th>
                {writable ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {list.data.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2">{m.title}</td>
                  <td>{fmtDateTime(m.starts_at)}</td>
                  <td>{(m.contacts as { full_name?: string } | null)?.full_name}</td>
                  <td>
                    <Badge tone={statusColors[m.status] ?? "slate"}>{m.status}</Badge>
                  </td>
                  {writable ? (
                    <td className="space-x-1">
                      <Button variant="ghost" onClick={() => openEdit(m as unknown as Meeting)}>Edit</Button>
                      {m.status === "scheduled" ? (
                        <Button variant="ghost" onClick={() => setCancelTarget(m.id)}>Cancel</Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={open} title={editTarget ? "Edit meeting" : "Schedule meeting"} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Field label="Title">
            <Input {...form.register("title")} />
          </Field>
          <Field label="Contact">
            <Select {...form.register("contact_id")}>
              <option value="">None</option>
              {(contacts.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select {...form.register("status")}>
              {["scheduled", "completed", "cancelled", "no_show"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Starts">
            <Input type="datetime-local" {...form.register("starts_at")} />
          </Field>
          <Field label="Ends">
            <Input type="datetime-local" {...form.register("ends_at")} />
          </Field>
          <Field label="Location">
            <Input {...form.register("location")} />
          </Field>
          <Field label="Agenda">
            <Textarea {...form.register("agenda")} />
          </Field>
          <Field label="Notes">
            <Textarea {...form.register("notes")} />
          </Field>
          <Field label="Outcome">
            <Input {...form.register("outcome")} placeholder="Summary of what was decided" />
          </Field>
          {save.error ? <p className="text-sm text-rose-700">{(save.error as Error).message}</p> : null}
          <Button type="submit" disabled={save.isPending}>Save</Button>
        </form>
      </Modal>
      <Confirm
        open={Boolean(cancelTarget)}
        title="Cancel this meeting?"
        body="The meeting status will be set to cancelled."
        confirmLabel="Cancel meeting"
        onClose={() => setCancelTarget(null)}
        onConfirm={() => { if (cancelTarget) cancel.mutate(cancelTarget); }}
      />
    </div>
  );
}
