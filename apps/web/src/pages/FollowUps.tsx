import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { canWrite, taskFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDateTime } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";
import { MemberSelect } from "./Companies";

type Form = z.infer<typeof taskFormSchema>;

function derivedStatus(row: { status: string; due_at: string | null }): string {
  if (["completed", "cancelled"].includes(row.status)) return row.status;
  if (row.due_at && new Date(row.due_at).getTime() < Date.now()) return "overdue";
  return row.status;
}

export function FollowUpsPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"today" | "upcoming" | "overdue" | "all" | "calendar">("today");
  // H5 fix: replace window.prompt() with an inline modal for completion notes
  const [completionModal, setCompletionModal] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const form = useForm<Form>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { title: "", kind: "follow_up", status: "pending", priority: "medium", reminder_email: false, recurrence_rule: "none" },
  });

  const contacts = useQuery({
    queryKey: ["contact-options", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, full_name").eq("organization_id", org!.organization_id).is("archived_at", null);
      if (error) throw error;
      return data;
    },
  });

  const list = useQuery({
    queryKey: ["tasks", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, contacts(full_name)")
        .eq("organization_id", org!.organization_id)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    return rows.filter((r) => {
      const derived = derivedStatus(r);
      if (view === "all" || view === "calendar") return true;
      if (view === "overdue") return derived === "overdue";
      if (view === "today") return r.due_at && new Date(r.due_at) >= start && new Date(r.due_at) < end;
      if (view === "upcoming") return r.due_at && new Date(r.due_at) >= end && !["completed", "cancelled"].includes(r.status);
      return true;
    });
  }, [list.data, view]);

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.from("tasks").insert({
        ...values,
        recurrence_rule: values.recurrence_rule === "none" ? null : values.recurrence_rule,
        organization_id: org!.organization_id,
        created_by: user!.id,
        due_at: values.due_at ? new Date(values.due_at).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
    },
  });

  const complete = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const current = (list.data ?? []).find((t) => t.id === id);
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", completed_at: new Date().toISOString(), completion_notes: notes })
        .eq("id", id);
      if (error) throw error;
      if (current && (current.recurrence_rule === "daily" || current.recurrence_rule === "weekly") && current.due_at) {
        const next = new Date(current.due_at);
        next.setDate(next.getDate() + (current.recurrence_rule === "weekly" ? 7 : 1));
        await supabase.from("tasks").insert({
          organization_id: org!.organization_id,
          contact_id: current.contact_id,
          title: current.title,
          description: current.description,
          kind: current.kind,
          assigned_to: current.assigned_to,
          created_by: user!.id,
          due_at: next.toISOString(),
          priority: current.priority,
          status: "pending",
          reminder_email: current.reminder_email,
          recurrence_rule: current.recurrence_rule,
          recurrence_parent_id: current.id,
        });
      }
    },
    onSuccess: () => {
      setCompletionModal(null);
      setCompletionNotes("");
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const startProgress = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ status: "in_progress" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Follow-ups & tasks"
        subtitle="Overdue is derived from due date. Reminders are created by the server worker, not the browser."
        actions={writable ? <Button onClick={() => setOpen(true)}>New task</Button> : null}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {(["today", "upcoming", "overdue", "all", "calendar"] as const).map((v) => (
          <Button key={v} variant={view === v ? "primary" : "secondary"} onClick={() => setView(v)}>
            {v}
          </Button>
        ))}
      </div>
      {view === "calendar" ? (
        <Card>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered
              .filter((t) => t.due_at)
              .map((t) => (
                <div key={t.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-slate-500">{fmtDateTime(t.due_at)}</p>
                  <Badge tone={derivedStatus(t) === "overdue" ? "rose" : "slate"}>{derivedStatus(t)}</Badge>
                </div>
              ))}
          </div>
        </Card>
      ) : !filtered.length ? (
        <Empty title="No tasks in this view" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Title</th>
                <th>Client</th>
                <th>Due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2">{t.title}</td>
                  <td>{(t.contacts as { full_name?: string } | null)?.full_name}</td>
                  <td>{fmtDateTime(t.due_at)}</td>
                  <td>
                    <Badge tone={derivedStatus(t) === "overdue" ? "rose" : "slate"}>{derivedStatus(t)}</Badge>
                  </td>
                  <td>
                    {writable && !["completed", "cancelled"].includes(t.status) ? (
                      <div className="flex items-center gap-1.5">
                        {t.status === "pending" ? (
                          <Button variant="ghost" disabled={startProgress.isPending} onClick={() => startProgress.mutate(t.id)}>
                            Start
                          </Button>
                        ) : null}
                        <Button variant="secondary" onClick={() => { setCompletionModal(t.id); setCompletionNotes(""); }}>
                          Complete
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={open} title="New task" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <Field label="Title" error={form.formState.errors.title?.message}>
            <Input {...form.register("title")} />
          </Field>
          <Field label="Description">
            <Textarea {...form.register("description")} />
          </Field>
          <Field label="Kind">
            <Select {...form.register("kind")}>
              <option value="follow_up">follow_up</option>
              <option value="task">task</option>
              <option value="reminder">reminder</option>
            </Select>
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
          <Field label="Assignee">
            <MemberSelect value={form.watch("assigned_to")} onChange={(v) => form.setValue("assigned_to", v)} />
          </Field>
          <Field label="Due">
            <Input type="datetime-local" {...form.register("due_at")} />
          </Field>
          <Field label="Priority">
            <Select {...form.register("priority")}>
              {["low", "medium", "high", "urgent"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Recurrence">
            <Select {...form.register("recurrence_rule")}>
              <option value="none">none</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("reminder_email")} /> Email reminder via worker
          </label>
          <Button type="submit">Save</Button>
        </form>
      </Modal>
      {/* H5 fix: Completion notes modal */}
      <Modal open={Boolean(completionModal)} title="Complete task" onClose={() => setCompletionModal(null)}>
        <div className="space-y-3">
          <Field label="Completion notes (optional)">
            <Textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} rows={3} />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={() => { if (completionModal) complete.mutate({ id: completionModal, notes: completionNotes }); }}
              disabled={complete.isPending}
            >
              Mark complete
            </Button>
            <Button variant="secondary" onClick={() => setCompletionModal(null)}>Cancel</Button>
          </div>
          {complete.error ? <p className="text-sm text-rose-700">{(complete.error as Error).message}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
