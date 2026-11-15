import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { canWrite, dealFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { money } from "../lib/format";
import { downloadWorkbook } from "../lib/export";
import { Badge, Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";
import { Kanban as KanbanIcon } from "lucide-react";

const STAGES = ["new_lead", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"] as const;
type Form = z.infer<typeof dealFormSchema>;

const STAGE_DOT: Record<string, string> = {
  new_lead: "bg-ink-400",
  contacted: "bg-sky-500",
  qualified: "bg-violet-500",
  proposal_sent: "bg-primary-400",
  negotiation: "bg-primary-600",
  won: "bg-emerald-500",
  lost: "bg-rose-500",
};

export function DealsPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [mode, setMode] = useState<"kanban" | "list">("kanban");
  const [open, setOpen] = useState(false);
  // H5 fix: replace window.prompt() with a modal for loss reason
  const [lossModal, setLossModal] = useState<{ id: string; stage: string } | null>(null);
  const [lossReason, setLossReason] = useState("");
  const form = useForm<Form>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: { title: "", stage: "new_lead", estimated_value: 0, currency: "INR", probability: 10 },
  });

  const contacts = useQuery({
    queryKey: ["contact-options", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => (await supabase.from("contacts").select("id, full_name").eq("organization_id", org!.organization_id).is("archived_at", null)).data ?? [],
  });

  const list = useQuery({
    queryKey: ["deals", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("*, contacts(full_name)").eq("organization_id", org!.organization_id);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.from("deals").insert({
        ...values,
        contact_id: values.contact_id || null,
        company_id: values.company_id || null,
        owner_id: values.owner_id || user!.id,
        owner_user_id: values.owner_id || user!.id,
        expected_close_date: values.expected_close_date ? values.expected_close_date : null,
        organization_id: org!.organization_id,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["deals"] });
      await qc.refetchQueries({ queryKey: ["deals"] });
      setOpen(false);
      form.reset();
    },
    onError: (err) => {
      console.error("Create deal failed:", err);
    },
  });

  async function executeDealMove(id: string, stage: string, lossReasonText?: string) {
    const patch: Record<string, unknown> = { stage, probability: stage === "won" ? 100 : stage === "lost" ? 0 : undefined };
    if (stage === "lost") patch.loss_reason = lossReasonText || "unspecified";
    const { data: deal, error } = await supabase.from("deals").update(patch).eq("id", id).select().single();
    if (error) throw error;
    if (stage === "won" && deal.contact_id) {
      const { error: cErr } = await supabase.from("contacts").update({ lifecycle: "customer", lead_status: "won" }).eq("id", deal.contact_id);
      if (cErr) console.warn("Failed to update contact lifecycle on deal win:", cErr);
      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({
          organization_id: org!.organization_id,
          contact_id: deal.contact_id,
          company_id: deal.company_id,
          deal_id: deal.id,
          name: deal.title,
          status: "planning",
          created_by: user!.id,
          owner_user_id: deal.owner_id || user!.id,
        })
        .select()
        .single();
      if (pErr) console.warn("Failed to auto-create project on deal win:", pErr);
      if (project) await supabase.from("deals").update({ converted_project_id: project.id }).eq("id", id);
      const { error: actErr } = await supabase.rpc("record_activity", {
        p_org: org!.organization_id,
        p_contact: deal.contact_id,
        p_company: deal.company_id,
        p_type: "deal",
        p_summary: `Deal won: ${deal.title}. History retained.`,
        p_outcome: "won",
        p_source_table: "deals",
        p_source_id: deal.id,
        p_next_follow_up: null,
      });
      if (actErr) console.warn("Failed to record deal win activity:", actErr);
    }
    await qc.invalidateQueries({ queryKey: ["deals"] });
  }

  const move = useMutation({
    mutationFn: async ({ id, stage, lossReasonText }: { id: string; stage: string; lossReasonText?: string }) => {
      await executeDealMove(id, stage, lossReasonText);
    },
    onSuccess: () => {
      setLossModal(null);
      setLossReason("");
    },
    onError: (err) => {
      console.error("Move deal stage failed:", err);
    },
  });

  const handleExport = () => {
    const rows = (list.data ?? []).map((d, idx) => ({
      "Sr No": idx + 1,
      "Deal Title": d.title || "",
      "Contact": (d.contacts as { full_name?: string } | null)?.full_name || "",
      "Stage": d.stage ? d.stage.toUpperCase().replace("_", " ") : "",
      "Estimated Value": d.estimated_value ? Number(d.estimated_value) : 0,
      "Currency": d.currency || "INR",
      "Probability (%)": d.probability ?? 10,
      "Expected Close Date": d.expected_close_date || "",
      "Created Date": d.created_at ? new Date(d.created_at).toLocaleDateString() : "",
      "Lost Reason": d.loss_reason || "",
    }));
    downloadWorkbook(
      `SMPatel_Deals_${new Date().toISOString().slice(0, 10)}.xlsx`,
      rows,
      "Deals"
    );
  };

  return (
    <div>
      <PageHeader
        title="Deals" icon={<KanbanIcon size={20} />}
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode(mode === "kanban" ? "list" : "kanban")}>
              {mode === "kanban" ? "List View" : "Kanban View"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleExport} disabled={!list.data?.length}>
              Export Excel
            </Button>
            {writable ? (
              <Button
                type="button"
                onClick={() => {
                  create.reset();
                  form.reset({ title: "", stage: "new_lead", estimated_value: 0, currency: "INR", probability: 10 });
                  setOpen(true);
                }}
              >
                + New Deal
              </Button>
            ) : null}
          </div>
        }
      />
      {move.error && !lossModal ? (
        <div className="mb-3 rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
          {(move.error as Error).message || "Failed to update deal stage"}
        </div>
      ) : null}
      {mode === "kanban" ? (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {STAGES.map((stage) => {
            const items = (list.data ?? []).filter((d) => d.stage === stage);
            const total = items.reduce((sum, d) => sum + Number(d.estimated_value || 0), 0);
            return (
              <div key={stage} className="flex w-[280px] shrink-0 snap-start flex-col rounded-card border border-ink-200/70 bg-ink-100/60">
                <div className="flex items-center justify-between gap-2 border-b border-ink-200/70 px-3 py-2.5">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold capitalize text-ink-800">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[stage] ?? "bg-ink-400"}`} />
                    <span className="truncate">{stage.replaceAll("_", " ")}</span>
                    <span className="rounded-full bg-white px-1.5 text-2xs font-semibold text-ink-500 ring-1 ring-ink-200">{items.length}</span>
                  </h3>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-ink-500">{money(total)}</span>
                </div>
                <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
                  {items.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-ink-300 px-3 py-6 text-center text-xs text-ink-400">No deals</p>
                  ) : null}
                  {items.map((d) => (
                    <div key={d.id} className="rounded-lg border border-ink-200/70 bg-white p-3 text-sm shadow-card transition-shadow hover:shadow-card-hover">
                      <p className="line-clamp-2 font-semibold text-ink-900">{d.title}</p>
                      <p className="mt-1 font-display text-base font-bold tabular-nums text-ink-800">{money(Number(d.estimated_value), d.currency)}</p>
                      {writable && stage !== "won" && stage !== "lost" ? (
                        <Select
                          className="mt-2.5 min-h-9 py-1.5 text-xs capitalize"
                          aria-label={`Move ${d.title} to stage`}
                          value={d.stage}
                          disabled={move.isPending}
                          onChange={(e) => {
                            const nextStage = e.target.value;
                            if (nextStage === "lost") {
                              move.reset();
                              setLossModal({ id: d.id, stage: "lost" });
                              setLossReason("");
                              return;
                            }
                            move.mutate({ id: d.id, stage: nextStage });
                          }}
                        >
                          {STAGES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </Select>
                      ) : (
                        <div className="mt-2.5">
                          <Badge tone={d.stage === "won" ? "green" : d.stage === "lost" ? "rose" : "slate"}>{d.stage}</Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="table-scroll"><table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Title</th>
                <th>Stage</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="py-2">{d.title}</td>
                  <td>{d.stage}</td>
                  <td>{money(Number(d.estimated_value), d.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
      <Modal size="lg" open={open} title="New deal" onClose={() => setOpen(false)}>
        <form
          className="form-grid"
          onSubmit={form.handleSubmit(
            (v) => create.mutate(v),
            (errors) => console.warn("Deal validation errors:", errors)
          )}
        >
          {create.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(create.error as Error).message || "Failed to save deal"}
            </div>
          ) : null}

          {Object.keys(form.formState.errors).length > 0 && !create.error ? (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800 border border-amber-200">
              Please fix the required fields highlighted below before saving.
            </div>
          ) : null}

          <Field label="Title" error={form.formState.errors.title?.message}>
            <Input placeholder="e.g. ERP Implementation Contract" {...form.register("title")} />
          </Field>
          <Field label="Contact" error={form.formState.errors.contact_id?.message}>
            <Select {...form.register("contact_id")}>
              <option value="">None</option>
              {(contacts.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Value (₹)" error={form.formState.errors.estimated_value?.message}>
            <Input type="number" step="0.01" min={0} {...form.register("estimated_value")} />
          </Field>
          <Field label="Expected close" error={form.formState.errors.expected_close_date?.message}>
            <Input type="date" {...form.register("expected_close_date")} />
          </Field>
          <Field label="Probability (%)" error={form.formState.errors.probability?.message}>
            <Input type="number" min={0} max={100} {...form.register("probability")} />
          </Field>
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? "Saving..." : "Save Deal"}
          </Button>
        </form>
      </Modal>
      {/* H5 fix: Loss reason modal replaces window.prompt() */}
      <Modal open={Boolean(lossModal)} title="Mark as lost" onClose={() => setLossModal(null)}>
        <div className="space-y-3">
          {move.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(move.error as Error).message || "Failed to mark deal as lost"}
            </div>
          ) : null}
          <Field label="Loss reason">
            <Textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="Why was this deal lost?" rows={3} />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              disabled={move.isPending}
              onClick={() => {
                if (!lossModal) return;
                move.mutate({ id: lossModal.id, stage: "lost", lossReasonText: lossReason || "unspecified" });
              }}
            >
              {move.isPending ? "Saving..." : "Confirm loss"}
            </Button>
            <Button type="button" variant="secondary" disabled={move.isPending} onClick={() => setLossModal(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
