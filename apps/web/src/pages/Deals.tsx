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

const STAGES = ["new_lead", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"] as const;
type Form = z.infer<typeof dealFormSchema>;

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
      const { error } = await supabase.from("deals").insert({ ...values, organization_id: org!.organization_id, created_by: user!.id, owner_id: values.owner_id || user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deals"] });
      setOpen(false);
    },
  });

  async function executeDealMove(id: string, stage: string, lossReasonText?: string) {
    const patch: Record<string, unknown> = { stage, probability: stage === "won" ? 100 : stage === "lost" ? 0 : undefined };
    if (stage === "lost") patch.loss_reason = lossReasonText || "unspecified";
    const { data: deal, error } = await supabase.from("deals").update(patch).eq("id", id).select().single();
    if (error) throw error;
    if (stage === "won" && deal.contact_id) {
      await supabase.from("contacts").update({ lifecycle: "customer", lead_status: "won" }).eq("id", deal.contact_id);
      const { data: project } = await supabase
        .from("projects")
        .insert({
          organization_id: org!.organization_id,
          contact_id: deal.contact_id,
          company_id: deal.company_id,
          deal_id: deal.id,
          name: deal.title,
          status: "planning",
          created_by: user!.id,
        })
        .select()
        .single();
      if (project) await supabase.from("deals").update({ converted_project_id: project.id }).eq("id", id);
      await supabase.rpc("record_activity", {
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
    }
    void qc.invalidateQueries({ queryKey: ["deals"] });
  }

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      if (stage === "lost") {
        // H5: open modal instead of window.prompt()
        setLossModal({ id, stage });
        setLossReason("");
        return;
      }
      await executeDealMove(id, stage);
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
        title="Deals"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setMode(mode === "kanban" ? "list" : "kanban")}>
              {mode === "kanban" ? "List View" : "Kanban View"}
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={!list.data?.length}>
              Export Excel
            </Button>
            {writable ? (
              <Button onClick={() => setOpen(true)}>
                + New Deal
              </Button>
            ) : null}
          </div>
        }
      />
      {mode === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <div key={stage} className="w-64 shrink-0 rounded-xl bg-slate-100 p-2">
              <h3 className="mb-2 px-1 text-sm font-medium capitalize">{stage.replaceAll("_", " ")}</h3>
              {(list.data ?? [])
                .filter((d) => d.stage === stage)
                .map((d) => (
                  <div key={d.id} className="mb-2 rounded-lg bg-white p-3 text-sm shadow-sm">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-slate-500">{money(Number(d.estimated_value), d.currency)}</p>
                    {writable && stage !== "won" && stage !== "lost" ? (
                      <Select className="mt-2" value={d.stage} onChange={(e) => move.mutate({ id: d.id, stage: e.target.value })}>
                        {STAGES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    ) : (
                      <Badge>{d.stage}</Badge>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <table className="w-full text-sm">
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
          </table>
        </Card>
      )}
      <Modal open={open} title="New deal" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
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
          <Field label="Value">
            <Input type="number" step="0.01" {...form.register("estimated_value")} />
          </Field>
          <Field label="Expected close">
            <Input type="date" {...form.register("expected_close_date")} />
          </Field>
          <Field label="Probability">
            <Input type="number" min={0} max={100} {...form.register("probability")} />
          </Field>
          <Button type="submit">Save</Button>
        </form>
      </Modal>
      {/* H5 fix: Loss reason modal replaces window.prompt() */}
      <Modal open={Boolean(lossModal)} title="Mark as lost" onClose={() => setLossModal(null)}>
        <div className="space-y-3">
          <Field label="Loss reason">
            <Textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="Why was this deal lost?" rows={3} />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={async () => {
                if (!lossModal) return;
                await executeDealMove(lossModal.id, "lost", lossReason || "unspecified");
                setLossModal(null);
              }}
            >
              Confirm loss
            </Button>
            <Button variant="secondary" onClick={() => setLossModal(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
