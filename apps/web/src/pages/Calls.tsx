import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { callFormSchema, canWrite } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDateTime, telHref } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";

type Form = z.infer<typeof callFormSchema>;

interface CallRow {
  id: string;
  called_at: string;
  direction: "incoming" | "outgoing";
  outcome: string;
  duration_seconds: number | null;
  notes: string | null;
  requirements: string | null;
  next_action: string | null;
  follow_up_at: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  contact_id: string;
  contacts?: { full_name?: string; primary_phone?: string } | null;
}

export function CallsPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<CallRow | null>(null);
  const [view, setView] = useState<"all" | "today" | "callback">("all");
  const [outcome, setOutcome] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const form = useForm<Form>({
    resolver: zodResolver(callFormSchema),
    defaultValues: {
      called_at: new Date().toISOString().slice(0, 16),
      direction: "outgoing",
      outcome: "answered",
      priority: "medium",
    },
  });

  const editForm = useForm<{
    outcome: "answered" | "not_answered" | "busy" | "callback" | "interested" | "not_interested";
    duration_seconds?: number;
    notes?: string;
    requirements?: string;
    next_action?: string;
    follow_up_at?: string;
  }>();

  const contacts = useQuery({
    queryKey: ["contact-options", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, primary_phone")
        .eq("organization_id", org!.organization_id)
        .is("archived_at", null)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const list = useQuery({
    queryKey: ["calls", org?.organization_id, view, outcome],
    enabled: Boolean(org),
    queryFn: async () => {
      let q = supabase
        .from("calls")
        .select("*, contacts(full_name, primary_phone)")
        .eq("organization_id", org!.organization_id)
        .order("called_at", { ascending: false })
        .limit(300);
      if (outcome) q = q.eq("outcome", outcome);
      if (view === "today") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        q = q.gte("called_at", start.toISOString());
      }
      if (view === "callback") q = q.eq("outcome", "callback");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CallRow[];
    },
  });

  const missed = useQuery({
    queryKey: ["missed-follow", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, follow_up_at, contacts(full_name)")
        .eq("organization_id", org!.organization_id)
        .lt("follow_up_at", new Date().toISOString())
        .not("follow_up_at", "is", null)
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const calledAtIso = values.called_at && values.called_at.trim() ? new Date(values.called_at).toISOString() : new Date().toISOString();
      const followUpIso = values.follow_up_at && values.follow_up_at.trim() ? new Date(values.follow_up_at).toISOString() : null;
      const { data, error } = await supabase
        .from("calls")
        .insert({
          ...values,
          organization_id: org!.organization_id,
          employee_id: user!.id,
          called_at: calledAtIso,
          follow_up_at: followUpIso,
        })
        .select()
        .single();
      if (error) throw error;
      await supabase.rpc("record_activity", {
        p_org: org!.organization_id,
        p_contact: values.contact_id,
        p_company: null,
        p_type: "call",
        p_summary: `${values.direction} call · ${values.outcome}`,
        p_outcome: values.outcome,
        p_source_table: "calls",
        p_source_id: data.id,
        p_next_follow_up: followUpIso,
      });
      if (followUpIso) {
        await supabase.from("tasks").insert({
          organization_id: org!.organization_id,
          contact_id: values.contact_id,
          title: "Follow up after call",
          kind: "follow_up",
          assigned_to: user!.id,
          created_by: user!.id,
          due_at: followUpIso,
          priority: values.priority,
          related_call_id: data.id,
        });
      }
    },
    onSuccess: async () => {
      setPage(1);
      setSearch("");
      await qc.invalidateQueries({ queryKey: ["calls"] });
      await qc.refetchQueries({ queryKey: ["calls"] });
      setOpen(false);
      form.reset();
    },
  });

  const update = useMutation({
    mutationFn: async (values: {
      id: string;
      outcome: "answered" | "not_answered" | "busy" | "callback" | "interested" | "not_interested";
      duration_seconds?: number;
      notes?: string;
      requirements?: string;
      next_action?: string;
      follow_up_at?: string;
    }) => {
      const followUpIso = values.follow_up_at && values.follow_up_at.trim() ? new Date(values.follow_up_at).toISOString() : null;
      const { error } = await supabase
        .from("calls")
        .update({
          outcome: values.outcome,
          duration_seconds: values.duration_seconds ?? null,
          notes: values.notes || null,
          requirements: values.requirements || null,
          next_action: values.next_action || null,
          follow_up_at: followUpIso,
        })
        .eq("id", values.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["calls"] });
      await qc.refetchQueries({ queryKey: ["calls"] });
      setEditingCall(null);
    },
  });

  const filteredCalls = (list.data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const contactName = c.contacts?.full_name?.toLowerCase() ?? "";
    const notes = c.notes?.toLowerCase() ?? "";
    const nextAct = c.next_action?.toLowerCase() ?? "";
    return contactName.includes(s) || notes.includes(s) || nextAct.includes(s);
  });

  const totalPages = Math.max(1, Math.ceil(filteredCalls.length / pageSize));
  const pageCalls = filteredCalls.slice((page - 1) * pageSize, page * pageSize);

  const openEdit = (c: CallRow) => {
    setEditingCall(c);
    editForm.reset({
      outcome: c.outcome as "answered" | "not_answered" | "busy" | "callback" | "interested" | "not_interested",
      duration_seconds: c.duration_seconds ?? undefined,
      notes: c.notes ?? "",
      requirements: c.requirements ?? "",
      next_action: c.next_action ?? "",
      follow_up_at: c.follow_up_at ? c.follow_up_at.slice(0, 16) : "",
    });
  };

  return (
    <div>
      <PageHeader
        title="Calls"
        subtitle="Manual call logging, follow-ups, and notes. tel: links allow quick browser dialing."
        actions={
          writable ? (
            <Button
              type="button"
              onClick={() => {
                create.reset();
                form.reset({
                  called_at: new Date().toISOString().slice(0, 16),
                  direction: "outgoing",
                  outcome: "answered",
                  priority: "medium",
                });
                setOpen(true);
              }}
            >
              Log call
            </Button>
          ) : null
        }
      />
      {missed.data?.length ? (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="font-medium text-amber-900">Missed call follow-ups</p>
          <ul className="mt-1 text-sm text-amber-800">
            {missed.data.map((m) => (
              <li key={m.id}>
                {(m.contacts as { full_name?: string } | null)?.full_name} · {fmtDateTime(m.follow_up_at)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "today", "callback"] as const).map((v) => (
          <Button key={v} variant={view === v ? "primary" : "secondary"} onClick={() => { setView(v); setPage(1); }}>
            {v}
          </Button>
        ))}
        <Select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }}>
          <option value="">All outcomes</option>
          {["answered", "not_answered", "busy", "callback", "interested", "not_interested"].map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
        <Input
          placeholder="Search by contact or notes..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      {!pageCalls.length ? (
        <Empty title="No calls found" hint={search ? "Try adjusting your search or filters" : "Log a call to start tracking customer calls."} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">When</th>
                <th>Contact</th>
                <th>Dir</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Dial</th>
                <th>Notes / Next</th>
                {writable ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {pageCalls.map((c) => {
                const phone = c.contacts?.primary_phone;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="py-2">{fmtDateTime(c.called_at)}</td>
                    <td className="font-medium">{c.contacts?.full_name ?? "—"}</td>
                    <td>{c.direction}</td>
                    <td>
                      <Badge tone={c.outcome === "interested" ? "green" : c.outcome === "callback" ? "amber" : "slate"}>
                        {c.outcome}
                      </Badge>
                    </td>
                    <td>{c.duration_seconds ? `${c.duration_seconds}s` : "—"}</td>
                    <td>
                      {telHref(phone) ? (
                        <a className="text-brand-700 underline" href={telHref(phone)!}>
                          Call
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-xs truncate text-slate-600">
                      {c.next_action ? `Next: ${c.next_action}` : c.notes ?? "—"}
                    </td>
                    {writable ? (
                      <td>
                        <Button variant="ghost" onClick={() => openEdit(c)}>
                          Edit
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">
                Page {page} of {totalPages} ({filteredCalls.length} calls)
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Log Call Modal */}
      <Modal open={open} title="Log call" onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(
            (v) => create.mutate(v),
            (errors) => console.warn("Log call validation errors:", errors)
          )}
        >
          {create.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(create.error as Error).message || "Failed to log call"}
            </div>
          ) : null}

          {Object.keys(form.formState.errors).length > 0 && !create.error ? (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800 border border-amber-200">
              Please fix the required fields highlighted below before saving.
            </div>
          ) : null}

          <Field label="Contact" error={form.formState.errors.contact_id?.message}>
            <Select {...form.register("contact_id")} required>
              <option value="">Select contact</option>
              {(contacts.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date and time" error={form.formState.errors.called_at?.message}>
            <Input type="datetime-local" {...form.register("called_at")} />
          </Field>
          <Field label="Direction" error={form.formState.errors.direction?.message}>
            <Select {...form.register("direction")}>
              <option value="outgoing">outgoing</option>
              <option value="incoming">incoming</option>
            </Select>
          </Field>
          <Field label="Duration (seconds)" error={form.formState.errors.duration_seconds?.message}>
            <Input type="number" min={0} {...form.register("duration_seconds")} />
          </Field>
          <Field label="Outcome" error={form.formState.errors.outcome?.message}>
            <Select {...form.register("outcome")}>
              {["answered", "not_answered", "busy", "callback", "interested", "not_interested"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" error={form.formState.errors.notes?.message}>
            <Textarea {...form.register("notes")} />
          </Field>
          <Field label="Requirements" error={form.formState.errors.requirements?.message}>
            <Textarea {...form.register("requirements")} />
          </Field>
          <Field label="Next action" error={form.formState.errors.next_action?.message}>
            <Input {...form.register("next_action")} />
          </Field>
          <Field label="Follow-up at" error={form.formState.errors.follow_up_at?.message}>
            <Input type="datetime-local" {...form.register("follow_up_at")} />
          </Field>
          <Field label="Priority" error={form.formState.errors.priority?.message}>
            <Select {...form.register("priority")}>
              {["low", "medium", "high", "urgent"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? "Saving..." : "Save Call Log"}
          </Button>
        </form>
      </Modal>

      {/* Edit Call Modal (H2) */}
      <Modal open={Boolean(editingCall)} title="Edit call details" onClose={() => setEditingCall(null)}>
        {editingCall && (
          <form
            className="space-y-3"
            onSubmit={editForm.handleSubmit((v) =>
              update.mutate({
                id: editingCall.id,
                outcome: v.outcome,
                duration_seconds: v.duration_seconds ? Number(v.duration_seconds) : undefined,
                notes: v.notes,
                requirements: v.requirements,
                next_action: v.next_action,
                follow_up_at: v.follow_up_at,
              })
            )}
          >
            <Field label="Outcome">
              <Select {...editForm.register("outcome")}>
                {["answered", "not_answered", "busy", "callback", "interested", "not_interested"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            </Field>
            <Field label="Duration (seconds)">
              <Input type="number" min={0} {...editForm.register("duration_seconds")} />
            </Field>
            <Field label="Notes">
              <Textarea {...editForm.register("notes")} />
            </Field>
            <Field label="Requirements">
              <Textarea {...editForm.register("requirements")} />
            </Field>
            <Field label="Next action">
              <Input {...editForm.register("next_action")} />
            </Field>
            <Field label="Follow-up at">
              <Input type="datetime-local" {...editForm.register("follow_up_at")} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditingCall(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Updating..." : "Update call"}
              </Button>
            </div>
            {update.error ? (
              <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
                {(update.error as Error).message || "Failed to update call"}
              </div>
            ) : null}
          </form>
        )}
      </Modal>
    </div>
  );
}
