import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canAdmin, canWrite } from "@crm/shared";
import { Ban, Download, FileDown, History, IndianRupee, Pencil, Plus, Wallet } from "lucide-react";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDate, fmtDateTime, money, todayIsoDate } from "../lib/format";
import { downloadWorkbook } from "../lib/export";
import { downloadReceiptPdf } from "../lib/receipt";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  TableSkeleton,
  Textarea,
  Toolbar,
  type BadgeTone,
} from "../components/ui";

export type PaymentRow = {
  id: string;
  organization_id: string;
  quotation_id: string;
  contact_id: string | null;
  company_id: string | null;
  owner_user_id: string | null;
  receipt_number: string;
  amount: number;
  currency: string;
  payment_kind: "advance" | "partial" | "full";
  payment_mode: "cash" | "upi" | "bank_transfer";
  reference: string | null;
  payment_date: string;
  notes: string | null;
  status: "valid" | "void";
  excess_reason: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  contacts: { full_name: string; primary_email: string | null; primary_phone: string | null } | null;
  companies: { name: string } | null;
  quotations: { title: string; total_amount: number } | null;
};

export type QuotationSummary = {
  quotation_id: string;
  organization_id: string;
  owner_user_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  title: string;
  quotation_status: string;
  currency: string;
  total_amount: number;
  created_at: string;
  approved_at: string | null;
  received_amount: number;
  outstanding_amount: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: "pending" | "partial" | "paid";
};

export const MODE_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer" };
export const KIND_LABEL: Record<string, string> = { advance: "Advance", partial: "Partial", full: "Full" };
export const STATUS_TONE: Record<string, BadgeTone> = { pending: "rose", partial: "amber", paid: "green" };

const PAYMENT_SELECT =
  "id, organization_id, quotation_id, contact_id, company_id, owner_user_id, receipt_number, amount, currency, payment_kind, payment_mode, reference, payment_date, notes, status, excess_reason, void_reason, created_by, created_at, contacts(full_name, primary_email, primary_phone), companies(name), quotations(title, total_amount)";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function normalizePayment(r: Record<string, unknown>): PaymentRow {
  return {
    ...(r as unknown as PaymentRow),
    amount: Number(r.amount),
    contacts: one(r.contacts as PaymentRow["contacts"]),
    companies: one(r.companies as PaymentRow["companies"]),
    quotations: one(r.quotations as PaymentRow["quotations"]),
  };
}

export function normalizeSummary(r: Record<string, unknown>): QuotationSummary {
  return {
    ...(r as unknown as QuotationSummary),
    total_amount: Number(r.total_amount),
    received_amount: Number(r.received_amount),
    outstanding_amount: Number(r.outstanding_amount),
    payment_count: Number(r.payment_count),
  };
}

function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/payments_reference_unique/.test(m)) return "This transaction reference has already been recorded.";
  return m;
}

export function PaymentsPage() {
  const { org, user } = useSession();
  const orgId = org?.organization_id;
  const qc = useQueryClient();
  const writable = canWrite(org?.role);
  const admin = canAdmin(org?.role);

  const [tab, setTab] = useState<"payments" | "quotations">("payments");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("valid");
  const [customer, setCustomer] = useState("");
  const [quotation, setQuotation] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payStatus, setPayStatus] = useState("");

  const [editing, setEditing] = useState<PaymentRow | "new" | null>(null);
  const [newForQuotation, setNewForQuotation] = useState<string>("");
  const [historyFor, setHistoryFor] = useState<PaymentRow | null>(null);
  const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const [quoteDetail, setQuoteDetail] = useState<QuotationSummary | null>(null);
  const [pdfError, setPdfError] = useState("");

  const payments = useQuery({
    queryKey: ["payments", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(PAYMENT_SELECT)
        .eq("organization_id", orgId!)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((r) => normalizePayment(r as Record<string, unknown>));
    },
  });

  const summaries = useQuery({
    queryKey: ["quotation-payment-summary", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_payment_summary")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((r) => normalizeSummary(r as Record<string, unknown>));
    },
  });

  const names = useQuery({
    queryKey: ["payment-lookups", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [contacts, companies] = await Promise.all([
        supabase.from("contacts").select("id, full_name, primary_email, primary_phone").eq("organization_id", orgId!).limit(5000),
        supabase.from("companies").select("id, name").eq("organization_id", orgId!).limit(5000),
      ]);
      return {
        contacts: new Map((contacts.data ?? []).map((c) => [c.id as string, c])),
        companies: new Map((companies.data ?? []).map((c) => [c.id as string, c.name as string])),
      };
    },
  });

  const customerName = (contactId: string | null, companyId: string | null) =>
    (contactId && names.data?.contacts.get(contactId)?.full_name) || (companyId && names.data?.companies.get(companyId)) || "—";

  const rows = payments.data ?? [];
  const sums = summaries.data ?? [];

  const customers = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sums) if (s.contact_id) m.set(s.contact_id, customerName(s.contact_id, s.company_id));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sums, names.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (status && p.status !== status) return false;
      if (mode && p.payment_mode !== mode) return false;
      if (customer && p.contact_id !== customer) return false;
      if (quotation && p.quotation_id !== quotation) return false;
      if (from && p.payment_date < from) return false;
      if (to && p.payment_date > to) return false;
      if (!q) return true;
      return [p.receipt_number, p.reference, p.contacts?.full_name, p.companies?.name, p.quotations?.title, p.notes]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, status, mode, customer, quotation, from, to]);

  const filteredSums = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sums.filter((s) => {
      if (payStatus && s.payment_status !== payStatus) return false;
      if (customer && s.contact_id !== customer) return false;
      if (!q) return true;
      return [s.title, customerName(s.contact_id, s.company_id)].some((v) => v?.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sums, search, payStatus, customer, names.data]);

  const totals = useMemo(() => {
    const received = filtered.filter((p) => p.status === "valid").reduce((s, p) => s + p.amount, 0);
    return {
      received,
      outstanding: sums.reduce((s, x) => s + x.outstanding_amount, 0),
      pending: sums.filter((s) => s.payment_status === "pending").length,
      partial: sums.filter((s) => s.payment_status === "partial").length,
    };
  }, [filtered, sums]);

  const summaryByQuote = useMemo(() => new Map(sums.map((s) => [s.quotation_id, s])), [sums]);

  const canEdit = (p: { owner_user_id: string | null }) => writable && (admin || p.owner_user_id === user?.id);

  const receipt = async (p: PaymentRow) => {
    setPdfError("");
    try {
      // Paid-to-date as of this receipt: valid payments up to and including this one.
      const same = rows
        .filter((r) => r.quotation_id === p.quotation_id && r.status === "valid")
        .filter((r) => r.payment_date < p.payment_date || (r.payment_date === p.payment_date && r.created_at <= p.created_at));
      const paid = same.reduce((s, r) => s + r.amount, 0);
      const total = Number(p.quotations?.total_amount ?? summaryByQuote.get(p.quotation_id)?.total_amount ?? 0);
      const contact = p.contact_id ? names.data?.contacts.get(p.contact_id) : null;
      await downloadReceiptPdf({
        orgName: org?.organizations?.name || "S.M.PATEL IT HUB",
        receiptNumber: p.receipt_number,
        paymentDate: fmtDate(p.payment_date),
        customerName: p.contacts?.full_name || contact?.full_name || p.companies?.name || "Customer",
        companyName: p.companies?.name,
        customerEmail: p.contacts?.primary_email ?? (contact?.primary_email as string | undefined),
        customerPhone: p.contacts?.primary_phone ?? (contact?.primary_phone as string | undefined),
        quotationTitle: p.quotations?.title || summaryByQuote.get(p.quotation_id)?.title || "Quotation",
        quotationTotal: total,
        amount: p.amount,
        paidToDate: paid,
        outstanding: Math.max(total - paid, 0),
        mode: p.payment_mode,
        kind: p.payment_kind,
        reference: p.reference,
        notes: p.notes,
        currency: p.currency || "INR",
        isVoid: p.status === "void",
        voidReason: p.void_reason,
      });
    } catch (e) {
      setPdfError(`Could not create the receipt: ${errText(e)}`);
    }
  };

  const exportList = () => {
    if (tab === "payments") {
      downloadWorkbook(
        `payments-${todayIsoDate()}.xlsx`,
        filtered.map((p) => ({
          "Receipt No": p.receipt_number,
          "Payment Date": p.payment_date,
          Customer: p.contacts?.full_name || p.companies?.name || "",
          Company: p.companies?.name || "",
          Quotation: p.quotations?.title || "",
          "Quotation Amount": Number(p.quotations?.total_amount ?? 0),
          Amount: p.amount,
          Type: KIND_LABEL[p.payment_kind],
          Mode: MODE_LABEL[p.payment_mode],
          "Transaction Ref": p.reference || "",
          Status: p.status === "void" ? `Void (${p.void_reason ?? ""})` : "Valid",
          Notes: p.notes || "",
        })),
        "Payments",
      );
    } else {
      downloadWorkbook(
        `quotation-payments-${todayIsoDate()}.xlsx`,
        filteredSums.map((s) => ({
          Quotation: s.title,
          Customer: customerName(s.contact_id, s.company_id),
          "Quotation Amount": s.total_amount,
          Received: s.received_amount,
          Outstanding: s.outstanding_amount,
          "Payment Status": s.payment_status,
          Payments: s.payment_count,
          "Last Payment": s.last_payment_date ?? "",
        })),
        "By quotation",
      );
    }
  };

  const loading = payments.isLoading || summaries.isLoading;
  const loadError = payments.error || summaries.error;

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Payments received against approved quotations, with receipts and outstanding balances."
        icon={<Wallet size={20} />}
        actions={
          <>
            <Button variant="secondary" onClick={exportList} disabled={loading}>
              <Download size={16} /> Export Excel
            </Button>
            {writable ? (
              <Button onClick={() => { setNewForQuotation(""); setEditing("new"); }}>
                <Plus size={16} /> Add payment
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Received (filtered)" value={money(totals.received)} icon={<IndianRupee size={16} />} tone="green" />
        <StatCard label="Outstanding" value={money(totals.outstanding)} icon={<Wallet size={16} />} tone="rose" />
        <StatCard label="Pending quotations" value={totals.pending} icon={<Ban size={16} />} tone="slate" hint="No payment yet" />
        <StatCard label="Partially paid" value={totals.partial} icon={<History size={16} />} tone="amber" />
      </div>

      <div className="mb-3 flex gap-1 rounded-lg border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-900 sm:inline-flex">
        {([["payments", "All payments"], ["quotations", "By quotation"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`min-h-9 flex-1 rounded-md px-4 text-sm font-medium transition sm:flex-none ${tab === k ? "bg-primary-50 text-primary-800 ring-1 ring-primary-200 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/20" : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"}`}>
            {l}
          </button>
        ))}
      </div>

      <Toolbar>
        <div className="min-w-0 flex-1 sm:min-w-[220px]">
          <SearchInput placeholder={tab === "payments" ? "Search receipt, reference, customer…" : "Search quotation or customer…"} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label="Customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className="sm:w-48">
          <option value="">All customers</option>
          {customers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </Select>
        {tab === "payments" ? (
          <>
            <Select aria-label="Quotation" value={quotation} onChange={(e) => setQuotation(e.target.value)} className="sm:w-48">
              <option value="">All quotations</option>
              {sums.map((s) => <option key={s.quotation_id} value={s.quotation_id}>{s.title}</option>)}
            </Select>
            <Select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value)} className="sm:w-36">
              <option value="">All modes</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
            </Select>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-32">
              <option value="valid">Valid</option>
              <option value="void">Voided</option>
              <option value="">All</option>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-[150px]" />
              <span className="text-xs text-ink-400">to</span>
              <Input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-[150px]" />
            </div>
          </>
        ) : (
          <Select aria-label="Payment status" value={payStatus} onChange={(e) => setPayStatus(e.target.value)} className="sm:w-40">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </Select>
        )}
      </Toolbar>

      {pdfError ? <div className="mb-3"><ErrorBox message={pdfError} /></div> : null}

      <Card className="p-0 sm:p-0">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={6} /></div>
        ) : loadError ? (
          <div className="p-4"><ErrorBox message={`Could not load payments: ${errText(loadError)}`} /></div>
        ) : tab === "payments" ? (
          filtered.length === 0 ? (
            <div className="p-6"><Empty title="No payments found" hint={writable ? "Record a payment against an approved quotation." : undefined} icon={<Wallet size={20} />} /></div>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Receipt</th><th>Date</th><th>Customer</th><th>Quotation</th><th>Type</th><th>Mode</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className={p.status === "void" ? "opacity-60" : ""}>
                      <td className="whitespace-nowrap font-medium">{p.receipt_number}</td>
                      <td className="whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                      <td className="max-w-[180px] truncate">{p.contacts?.full_name || p.companies?.name || "—"}</td>
                      <td className="max-w-[200px] truncate">
                        <button type="button" className="truncate text-left text-primary-700 hover:underline dark:text-primary-300"
                          onClick={() => { const s = summaryByQuote.get(p.quotation_id); if (s) setQuoteDetail(s); }}>
                          {p.quotations?.title ?? "—"}
                        </button>
                      </td>
                      <td>{KIND_LABEL[p.payment_kind]}</td>
                      <td className="whitespace-nowrap">{MODE_LABEL[p.payment_mode]}</td>
                      <td className="max-w-[140px] truncate">{p.reference || "—"}</td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(p.amount, p.currency)}</td>
                      <td>{p.status === "void" ? <Badge tone="rose">Void</Badge> : <Badge tone="green">Valid</Badge>}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Download receipt PDF" onClick={() => void receipt(p)}><FileDown size={15} /></Button>
                          <Button size="sm" variant="ghost" title="Edit history" onClick={() => setHistoryFor(p)}><History size={15} /></Button>
                          {p.status === "valid" && canEdit(p) ? (
                            <>
                              <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(p)}><Pencil size={15} /></Button>
                              <Button size="sm" variant="ghost" title="Void" onClick={() => setVoiding(p)}><Ban size={15} /></Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : filteredSums.length === 0 ? (
          <div className="p-6"><Empty title="No approved quotations" hint="Payments can be recorded once a quotation is approved." icon={<Wallet size={20} />} /></div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Quotation</th><th>Customer</th><th className="text-right">Quotation amount</th><th className="text-right">Received</th><th className="text-right">Outstanding</th><th>Status</th><th>Payments</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSums.map((s) => (
                  <tr key={s.quotation_id}>
                    <td className="max-w-[220px] truncate font-medium">
                      <button type="button" className="truncate text-left hover:underline" onClick={() => setQuoteDetail(s)}>{s.title}</button>
                    </td>
                    <td className="max-w-[180px] truncate">{customerName(s.contact_id, s.company_id)}</td>
                    <td className="text-right tabular-nums">{money(s.total_amount, s.currency)}</td>
                    <td className="text-right tabular-nums">{money(s.received_amount, s.currency)}</td>
                    <td className="text-right font-semibold tabular-nums">{money(s.outstanding_amount, s.currency)}</td>
                    <td><Badge tone={STATUS_TONE[s.payment_status]}>{s.payment_status}</Badge></td>
                    <td className="tabular-nums">{s.payment_count}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setQuoteDetail(s)}>History</Button>
                        {writable && s.outstanding_amount > 0 && canEdit(s) ? (
                          <Button size="sm" variant="secondary" onClick={() => { setNewForQuotation(s.quotation_id); setEditing("new"); }}><Plus size={14} /> Pay</Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <PaymentForm
          key={editing === "new" ? `new-${newForQuotation}` : editing.id}
          payment={editing === "new" ? null : editing}
          initialQuotation={newForQuotation}
          summaries={sums.filter((s) => admin || s.owner_user_id === user?.id)}
          allSummaries={summaryByQuote}
          customerName={customerName}
          admin={admin}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["payments", orgId] });
            qc.invalidateQueries({ queryKey: ["quotation-payment-summary", orgId] });
            qc.invalidateQueries({ queryKey: ["dashboard-payments"] });
            if (p) void receipt(p);
          }}
        />
      ) : null}

      <AuditModal payment={historyFor} onClose={() => setHistoryFor(null)} />

      <VoidModal
        payment={voiding}
        onClose={() => setVoiding(null)}
        onDone={() => {
          setVoiding(null);
          qc.invalidateQueries({ queryKey: ["payments", orgId] });
          qc.invalidateQueries({ queryKey: ["quotation-payment-summary", orgId] });
        }}
      />

      <Modal size="lg" open={Boolean(quoteDetail)} title={quoteDetail ? `Payments · ${quoteDetail.title}` : ""} onClose={() => setQuoteDetail(null)}>
        {quoteDetail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Quotation" value={money(quoteDetail.total_amount, quoteDetail.currency)} />
              <Mini label="Received" value={money(quoteDetail.received_amount, quoteDetail.currency)} />
              <Mini label="Outstanding" value={money(quoteDetail.outstanding_amount, quoteDetail.currency)} />
              <Mini label="Status" value={<Badge tone={STATUS_TONE[quoteDetail.payment_status]}>{quoteDetail.payment_status}</Badge>} />
            </div>
            <p className="text-sm text-ink-600 dark:text-ink-300">Customer: <b>{customerName(quoteDetail.contact_id, quoteDetail.company_id)}</b></p>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead><tr><th>Receipt</th><th>Date</th><th>Type</th><th>Mode</th><th>Reference</th><th className="text-right">Amount</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.filter((p) => p.quotation_id === quoteDetail.quotation_id).map((p) => (
                    <tr key={p.id} className={p.status === "void" ? "opacity-60" : ""}>
                      <td>{p.receipt_number}</td>
                      <td className="whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                      <td>{KIND_LABEL[p.payment_kind]}</td>
                      <td>{MODE_LABEL[p.payment_mode]}</td>
                      <td>{p.reference || "—"}</td>
                      <td className="text-right tabular-nums">{money(p.amount, p.currency)}</td>
                      <td>{p.status === "void" ? <Badge tone="rose">Void</Badge> : <Badge tone="green">Valid</Badge>}</td>
                      <td><Button size="sm" variant="ghost" title="Receipt PDF" onClick={() => void receipt(p)}><FileDown size={14} /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {writable && quoteDetail.outstanding_amount > 0 && canEdit(quoteDetail) ? (
              <Button onClick={() => { setNewForQuotation(quoteDetail.quotation_id); setQuoteDetail(null); setEditing("new"); }}>
                <Plus size={15} /> Record payment
              </Button>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
      <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900 tabular-nums dark:text-white">{value}</p>
    </div>
  );
}

function PaymentForm({
  payment,
  initialQuotation,
  summaries,
  allSummaries,
  customerName,
  admin,
  onClose,
  onSaved,
}: {
  payment: PaymentRow | null;
  initialQuotation: string;
  summaries: QuotationSummary[];
  allSummaries: Map<string, QuotationSummary>;
  customerName: (c: string | null, co: string | null) => string;
  admin: boolean;
  onClose: () => void;
  onSaved: (p: PaymentRow | null) => void;
}) {
  const { org } = useSession();
  const editing = Boolean(payment);
  const [quotationId, setQuotationId] = useState(payment?.quotation_id ?? initialQuotation);
  const q = allSummaries.get(quotationId);
  // When editing, this payment's own amount is already inside "received".
  const otherReceived = q ? q.received_amount - (payment && payment.status === "valid" ? payment.amount : 0) : 0;
  const outstanding = q ? Math.max(q.total_amount - otherReceived, 0) : 0;
  const [amount, setAmount] = useState<string>(payment ? String(payment.amount) : q ? String(Math.max(q.outstanding_amount, 0) || "") : "");
  const [kind, setKind] = useState<"advance" | "partial">(payment?.payment_kind === "advance" ? "advance" : "partial");
  const [mode, setMode] = useState(payment?.payment_mode ?? "upi");
  const [reference, setReference] = useState(payment?.reference ?? "");
  const [date, setDate] = useState(payment?.payment_date ?? todayIsoDate());
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [excessReason, setExcessReason] = useState(payment?.excess_reason ?? "");
  const [downloadReceipt, setDownloadReceipt] = useState(!editing);
  const [error, setError] = useState("");

  const amt = Number(amount);
  const exceeds = q ? amt > outstanding + 0.0001 : false;
  const autoKind = q && otherReceived === 0 && amt >= q.total_amount ? "full" : kind;

  const save = useMutation({
    mutationFn: async () => {
      setError("");
      if (!q) throw new Error("Choose an approved quotation.");
      if (!(amt > 0)) throw new Error("Enter an amount greater than zero.");
      if (mode !== "cash" && !reference.trim()) throw new Error("Enter the transaction reference (UTR / UPI ref) for UPI and bank transfers.");
      if (exceeds && !admin) throw new Error(`Amount is more than the outstanding balance (${money(outstanding, q.currency)}). Ask an Owner/Admin to approve an excess adjustment.`);
      if (exceeds && excessReason.trim().length < 5) throw new Error("Enter a reason (at least 5 characters) for accepting more than the quotation amount.");
      if (date > todayIsoDate()) throw new Error("Payment date cannot be in the future.");
      const values = {
        amount: Math.round(amt * 100) / 100,
        payment_kind: autoKind,
        payment_mode: mode,
        reference: reference.trim() || null,
        payment_date: date,
        notes: notes.trim() || null,
        excess_reason: exceeds ? excessReason.trim() : null,
      };
      if (payment) {
        const { data, error: e } = await supabase.from("payments").update(values).eq("id", payment.id).select(PAYMENT_SELECT).single();
        if (e) throw e;
        return normalizePayment(data as Record<string, unknown>);
      }
      const { data, error: e } = await supabase
        .from("payments")
        .insert({ ...values, organization_id: org!.organization_id, quotation_id: quotationId })
        .select(PAYMENT_SELECT)
        .single();
      if (e) throw e;
      return normalizePayment(data as Record<string, unknown>);
    },
    onSuccess: (p) => onSaved(downloadReceipt ? p : null),
    onError: (e) => setError(errText(e)),
  });

  return (
    <Modal size="lg" open title={editing ? `Edit payment ${payment!.receipt_number}` : "Add payment"} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label="Approved quotation" required>
          <Select value={quotationId} disabled={editing} onChange={(e) => {
            const id = e.target.value;
            setQuotationId(id);
            const s = allSummaries.get(id);
            if (s) setAmount(String(Math.max(s.outstanding_amount, 0) || ""));
          }}>
            <option value="">Select quotation…</option>
            {summaries.map((s) => (
              <option key={s.quotation_id} value={s.quotation_id} disabled={s.outstanding_amount <= 0 && !admin}>
                {s.title} · {customerName(s.contact_id, s.company_id)} · due {money(s.outstanding_amount, s.currency)}
              </option>
            ))}
          </Select>
        </Field>

        {q ? (
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-800/60">
            <div><p className="text-2xs uppercase text-ink-500">Quotation</p><p className="font-semibold tabular-nums">{money(q.total_amount, q.currency)}</p></div>
            <div><p className="text-2xs uppercase text-ink-500">Already received</p><p className="font-semibold tabular-nums">{money(otherReceived, q.currency)}</p></div>
            <div><p className="text-2xs uppercase text-ink-500">Outstanding</p><p className="font-semibold tabular-nums text-rose-700 dark:text-rose-300">{money(outstanding, q.currency)}</p></div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount received" required hint={q && amt > 0 && !exceeds ? `Balance after this: ${money(Math.max(outstanding - amt, 0), q.currency)}` : undefined}>
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Payment date" required>
            <Input type="date" max={todayIsoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Payment mode" required>
            <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentRow["payment_mode"])}>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
            </Select>
          </Field>
          <Field label="Transaction reference" required={mode !== "cash"} hint={mode === "cash" ? "Optional for cash" : "UTR / UPI transaction ID"}>
            <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Payment type" hint={autoKind === "full" ? "Covers the full quotation amount: recorded as Full." : undefined}>
            <Select value={autoKind === "full" ? "full" : kind} disabled={autoKind === "full"} onChange={(e) => setKind(e.target.value as "advance" | "partial")}>
              <option value="advance">Advance</option>
              <option value="partial">Partial</option>
              {autoKind === "full" ? <option value="full">Full</option> : null}
            </Select>
          </Field>
        </div>

        {exceeds ? (
          admin ? (
            <Field label="Excess adjustment reason (Owner/Admin)" required hint="The amount is more than the outstanding balance. This approval is recorded in the payment history.">
              <Input value={excessReason} onChange={(e) => setExcessReason(e.target.value)} maxLength={500} />
            </Field>
          ) : (
            <p className="rounded-control border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              The amount is more than the outstanding balance. Only an Owner or Admin can accept an excess payment.
            </p>
          )
        ) : null}

        <Field label="Notes">
          <Textarea rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {!editing ? (
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
            <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={downloadReceipt} onChange={(e) => setDownloadReceipt(e.target.checked)} />
            Download the receipt PDF after saving
          </label>
        ) : null}

        {error ? <ErrorBox message={error} /> : null}

        <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-4 dark:border-ink-800 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !q}>{save.isPending ? "Saving..." : editing ? "Save changes" : "Save payment"}</Button>
        </div>
      </form>
    </Modal>
  );
}

const FIELD_LABEL: Record<string, string> = {
  amount: "Amount", payment_mode: "Mode", payment_kind: "Type", reference: "Reference", payment_date: "Date",
  notes: "Notes", status: "Status", excess_reason: "Excess reason", void_reason: "Void reason", receipt_number: "Receipt",
};

function AuditModal({ payment, onClose }: { payment: PaymentRow | null; onClose: () => void }) {
  const audit = useQuery({
    queryKey: ["payment-audit", payment?.id],
    enabled: Boolean(payment),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_audit")
        .select("id, action, actor_user_id, changes, created_at")
        .eq("payment_id", payment!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((a) => a.actor_user_id).filter(Boolean))] as string[];
      const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
      const nm = new Map((people ?? []).map((p) => [p.id as string, (p.full_name as string) || "Team member"]));
      return (data ?? []).map((a) => ({ ...a, who: a.actor_user_id ? nm.get(a.actor_user_id as string) ?? "Team member" : "System" }));
    },
  });
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  return (
    <Modal size="lg" open={Boolean(payment)} title={payment ? `History · ${payment.receipt_number}` : ""} onClose={onClose}>
      {audit.isLoading ? (
        <TableSkeleton rows={3} />
      ) : audit.error ? (
        <ErrorBox message={errText(audit.error)} />
      ) : (
        <ol className="space-y-3">
          {(audit.data ?? []).map((a) => {
            const ch = a.changes as Record<string, unknown>;
            return (
              <li key={a.id} className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={a.action === "voided" ? "rose" : a.action === "created" ? "green" : "blue"}>{a.action}</Badge>
                  <span className="text-xs text-ink-500">{a.who} · {fmtDateTime(a.created_at as string)}</span>
                </div>
                <ul className="space-y-0.5 text-sm text-ink-700 dark:text-ink-300">
                  {Object.entries(ch).map(([k, v]) =>
                    a.action === "created" ? (
                      <li key={k}><span className="text-ink-500">{FIELD_LABEL[k] ?? k}:</span> {show(v)}</li>
                    ) : (
                      <li key={k}>
                        <span className="text-ink-500">{FIELD_LABEL[k] ?? k}:</span> {show((v as { from?: unknown }).from)} → <b>{show((v as { to?: unknown }).to)}</b>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}

function VoidModal({ payment, onClose, onDone }: { payment: PaymentRow | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const run = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error("Enter a reason (at least 3 characters).");
      const { error: e } = await supabase.from("payments").update({ status: "void", void_reason: reason.trim() }).eq("id", payment!.id);
      if (e) throw e;
    },
    onSuccess: () => { setReason(""); onDone(); },
    onError: (e) => setError(errText(e)),
  });
  return (
    <Modal size="sm" open={Boolean(payment)} title={payment ? `Void ${payment.receipt_number}?` : ""} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          The payment of <b>{payment ? money(payment.amount, payment.currency) : ""}</b> stays in the history but no longer counts towards the quotation. This cannot be undone.
        </p>
        <Field label="Reason" required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Entered twice, cheque bounced" />
        </Field>
        {error ? <ErrorBox message={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Voiding..." : "Void payment"}</Button>
        </div>
      </div>
    </Modal>
  );
}
