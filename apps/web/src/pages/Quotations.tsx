import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import DOMPurify from "dompurify";
import { canAdmin, canWrite, quotationFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { money, fmtDateTime } from "../lib/format";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";

type Form = z.infer<typeof quotationFormSchema>;

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface QuotationRow {
  id: string;
  title: string;
  status: "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "expired";
  currency: string;
  total_amount: number;
  requires_approval: boolean;
  current_version: number;
  created_at: string;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
}

interface QuotationVersionRow {
  id: string;
  version_number: number;
  line_items: LineItem[];
  total_amount: number;
  body_html: string;
  created_at: string;
}

export function QuotationsPage() {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const admin = canAdmin(org?.role);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [versionModalQuote, setVersionModalQuote] = useState<QuotationRow | null>(null);
  const [newVersionModalQuote, setNewVersionModalQuote] = useState<QuotationRow | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const pageSize = 15;

  // Line items state for create modal
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "Standard IT Support Services", quantity: 1, unit_price: 15000 },
  ]);

  // Line items state for new version modal
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [newVersionBody, setNewVersionBody] = useState("");

  const form = useForm<Form>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      title: "",
      currency: "INR",
      total_amount: 15000,
      requires_approval: true,
      body_html: "<p>Thank you for your business. Please review the proposal details below.</p>",
    },
  });

  const list = useQuery({
    queryKey: ["quotes", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QuotationRow[];
    },
  });

  // Query versions for the modal
  const versions = useQuery({
    queryKey: ["quote-versions", versionModalQuote?.id],
    enabled: Boolean(versionModalQuote?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_versions")
        .select("*")
        .eq("quotation_id", versionModalQuote!.id)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QuotationVersionRow[];
    },
  });

  // Line items math
  const calculateTotal = (items: LineItem[]) => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  };

  const updateItem = (index: number, field: keyof LineItem, val: string | number) => {
    setLineItems((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      copy[index] = { ...target, [field]: val } as LineItem;
      const tot = calculateTotal(copy);
      form.setValue("total_amount", tot);
      return copy;
    });
  };

  const updateEditItem = (index: number, field: keyof LineItem, val: string | number) => {
    setEditLineItems((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      copy[index] = { ...target, [field]: val } as LineItem;
      return copy;
    });
  };

  const addItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: String(Date.now()), description: "", quantity: 1, unit_price: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    setLineItems((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      form.setValue("total_amount", calculateTotal(copy));
      return copy;
    });
  };

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const computedTotal = calculateTotal(lineItems);
      const { data, error } = await supabase
        .from("quotations")
        .insert({
          title: values.title,
          deal_id: values.deal_id || null,
          contact_id: values.contact_id || null,
          company_id: values.company_id || null,
          currency: values.currency,
          total_amount: computedTotal || values.total_amount,
          requires_approval: values.requires_approval,
          status: values.requires_approval ? "pending_approval" : "draft",
          organization_id: org!.organization_id,
          created_by: user!.id,
          current_version: 1,
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("quotation_versions").insert({
        organization_id: org!.organization_id,
        quotation_id: data.id,
        version_number: 1,
        body_html: DOMPurify.sanitize(values.body_html || ""),
        line_items: lineItems,
        total_amount: computedTotal || values.total_amount,
        created_by: user!.id,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quotes"] });
      setOpen(false);
      form.reset();
      setLineItems([{ id: "1", description: "Standard IT Support Services", quantity: 1, unit_price: 15000 }]);
    },
  });

  const createNewVersion = useMutation({
    mutationFn: async () => {
      if (!newVersionModalQuote) return;
      const computedTotal = calculateTotal(editLineItems);
      const nextVer = (newVersionModalQuote.current_version || 1) + 1;

      const { error: verErr } = await supabase.from("quotation_versions").insert({
        organization_id: org!.organization_id,
        quotation_id: newVersionModalQuote.id,
        version_number: nextVer,
        body_html: DOMPurify.sanitize(newVersionBody || ""),
        line_items: editLineItems,
        total_amount: computedTotal,
        created_by: user!.id,
      });
      if (verErr) throw verErr;

      const { error: quoteErr } = await supabase
        .from("quotations")
        .update({
          current_version: nextVer,
          total_amount: computedTotal,
          status: newVersionModalQuote.requires_approval ? "pending_approval" : "draft",
        })
        .eq("id", newVersionModalQuote.id);
      if (quoteErr) throw quoteErr;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["quotes"] });
      setNewVersionModalQuote(null);
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quotations")
        .update({ status: "approved", approved_by: user!.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["quotes"] }),
  });

  const printPdf = (q: QuotationRow) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>${q.title} - Quotation</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
            .meta { color: #64748b; font-size: 14px; }
            .total { font-size: 18px; font-weight: bold; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${q.title}</h1>
            <p class="meta">Version ${q.current_version} · Status: ${q.status} · Date: ${fmtDateTime(q.created_at)}</p>
          </div>
          <div class="total">
            Total Quotation Amount: ${money(Number(q.total_amount), q.currency)}
          </div>
          <p style="margin-top: 32px; font-size: 12px; color: #94a3b8;">Printed from IT Services CRM</p>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const openNewVersionDialog = async (q: QuotationRow) => {
    setNewVersionModalQuote(q);
    // fetch latest version line items
    const { data } = await supabase
      .from("quotation_versions")
      .select("*")
      .eq("quotation_id", q.id)
      .eq("version_number", q.current_version)
      .maybeSingle();

    if (data?.line_items && Array.isArray(data.line_items) && data.line_items.length > 0) {
      setEditLineItems(data.line_items as LineItem[]);
      setNewVersionBody(data.body_html || "");
    } else {
      setEditLineItems([{ id: "1", description: q.title, quantity: 1, unit_price: Number(q.total_amount) }]);
      setNewVersionBody("");
    }
  };

  const filtered = (list.data ?? []).filter((q) => {
    if (!search.trim()) return true;
    return q.title.toLowerCase().includes(search.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageQuotes = filtered.slice((page - 1) * pageSize, page * pageSize);

  const statusTone = (st: string): "slate" | "green" | "amber" | "rose" | "teal" => {
    if (st === "approved" || st === "accepted") return "green";
    if (st === "pending_approval") return "amber";
    if (st === "rejected" || st === "expired") return "rose";
    if (st === "sent") return "teal";
    return "slate";
  };

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Quotations with line items, version history, and approval workflows."
        actions={writable ? <Button onClick={() => setOpen(true)}>New quotation</Button> : null}
      />

      <div className="mb-4">
        <Input
          placeholder="Search quotations by title..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      {!pageQuotes.length ? (
        <Empty title="No quotations found" hint={search ? "Try adjusting your search" : "Create a quotation to send estimates to clients."} />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Title</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Version</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageQuotes.map((q) => (
                <tr key={q.id} className="border-t">
                  <td className="py-2 font-medium">{q.title}</td>
                  <td>
                    <Badge tone={statusTone(q.status)}>{q.status}</Badge>
                  </td>
                  <td>{money(Number(q.total_amount), q.currency)}</td>
                  <td>v{q.current_version}</td>
                  <td className="space-x-1.5">
                    <Button variant="ghost" onClick={() => printPdf(q)}>
                      PDF
                    </Button>
                    <Button variant="ghost" onClick={() => setVersionModalQuote(q)}>
                      History
                    </Button>
                    {writable && (
                      <Button variant="ghost" onClick={() => void openNewVersionDialog(q)}>
                        New Rev
                      </Button>
                    )}
                    {admin && q.status === "pending_approval" ? (
                      <Button variant="secondary" onClick={() => approve.mutate(q.id)} disabled={approve.isPending}>
                        Approve
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-500">
                Page {page} of {totalPages} ({filtered.length} quotations)
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

      {/* Create Quotation Modal with Line Items Editor (H9) */}
      <Modal open={open} title="New quotation" onClose={() => setOpen(false)}>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <Field label="Quotation Title">
            <Input {...form.register("title")} required placeholder="e.g. Annual IT Support Contract" />
          </Field>

          {/* Line items table */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Line Items</span>
              <Button type="button" variant="ghost" onClick={addItem} className="text-xs">
                + Add item
              </Button>
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {lineItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    className="flex-1 text-xs"
                    required
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                    className="w-16 text-xs"
                    required
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="Rate"
                    value={item.unit_price}
                    onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                    className="w-24 text-xs"
                    required
                  />
                  <span className="w-20 text-right text-xs font-medium text-slate-700">
                    {money((Number(item.quantity) || 0) * (Number(item.unit_price) || 0), form.watch("currency") || "INR")}
                  </span>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => removeItem(idx)}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-2 text-sm font-semibold text-slate-900 border-t border-slate-200">
                Total: {money(calculateTotal(lineItems), form.watch("currency") || "INR")}
              </div>
            </div>
          </div>

          <Field label="Notes / Terms (HTML)">
            <Textarea rows={3} {...form.register("body_html")} />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("requires_approval")} /> Require managerial approval before sending
          </label>

          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Save quotation"}
          </Button>
        </form>
      </Modal>

      {/* Version History Modal (H9) */}
      <Modal open={Boolean(versionModalQuote)} title={`Version History: ${versionModalQuote?.title}`} onClose={() => setVersionModalQuote(null)}>
        <div className="space-y-4">
          {versions.data?.length === 0 ? (
            <p className="text-sm text-slate-500">No versions recorded.</p>
          ) : (
            <div className="space-y-3">
              {versions.data?.map((v) => (
                <div key={v.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-semibold text-slate-800">Version {v.version_number}</span>
                    <span className="text-xs text-slate-500">{fmtDateTime(v.created_at)}</span>
                  </div>
                  <div className="mt-2 text-sm">
                    <p className="font-medium text-slate-700">Total: {money(Number(v.total_amount), versionModalQuote?.currency || "INR")}</p>
                    {Array.isArray(v.line_items) && v.line_items.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs font-medium text-slate-500">Line Items:</span>
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {v.line_items.map((li, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>{li.description} (x{li.quantity})</span>
                              <span>{money((li.quantity || 0) * (li.unit_price || 0), versionModalQuote?.currency || "INR")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* New Revision / Version Modal (H9) */}
      <Modal open={Boolean(newVersionModalQuote)} title={`New Revision: ${newVersionModalQuote?.title} (v${(newVersionModalQuote?.current_version || 1) + 1})`} onClose={() => setNewVersionModalQuote(null)}>
        {newVersionModalQuote && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Line Items for New Revision</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setEditLineItems((prev) => [...prev, { id: String(Date.now()), description: "", quantity: 1, unit_price: 0 }])}
                >
                  + Add item
                </Button>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {editLineItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateEditItem(idx, "description", e.target.value)}
                      className="flex-1 text-xs"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateEditItem(idx, "quantity", Number(e.target.value))}
                      className="w-16 text-xs"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="Rate"
                      value={item.unit_price}
                      onChange={(e) => updateEditItem(idx, "unit_price", Number(e.target.value))}
                      className="w-24 text-xs"
                    />
                    <span className="w-20 text-right text-xs font-medium text-slate-700">
                      {money((Number(item.quantity) || 0) * (Number(item.unit_price) || 0), newVersionModalQuote.currency)}
                    </span>
                    {editLineItems.length > 1 && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-rose-600"
                        onClick={() => setEditLineItems(editLineItems.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex justify-end pt-2 text-sm font-semibold text-slate-900 border-t border-slate-200">
                  New Total: {money(calculateTotal(editLineItems), newVersionModalQuote.currency)}
                </div>
              </div>
            </div>

            <Field label="Revision Notes (HTML)">
              <Textarea rows={3} value={newVersionBody} onChange={(e) => setNewVersionBody(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setNewVersionModalQuote(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={createNewVersion.isPending} onClick={() => createNewVersion.mutate()}>
                {createNewVersion.isPending ? "Creating revision..." : `Create v${(newVersionModalQuote.current_version || 1) + 1}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
