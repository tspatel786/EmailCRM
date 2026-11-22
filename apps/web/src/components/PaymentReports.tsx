import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Wallet } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fmtDate, money } from "../lib/format";
import { downloadWorkbook } from "../lib/export";
import { invoiceNumberFor } from "../lib/invoicePdf";
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Select, TableSkeleton } from "./ui";
import { KIND_LABEL, MODE_LABEL, STATUS_TONE, normalizePayment, normalizeSummary } from "../pages/Payments";

type Report = "customer" | "quotation" | "date" | "outstanding";
const TITLES: Record<Report, string> = {
  customer: "Customer-wise payments",
  quotation: "Quotation-wise payments",
  date: "Date-wise collection",
  outstanding: "Outstanding payments",
};

/** Payment reports for the Reports page. Uses the same date range; RLS limits rows to what the viewer may see. */
export function PaymentReports({ orgId, from, to }: { orgId: string; from: string; to: string }) {
  const [report, setReport] = useState<Report>("customer");

  const data = useQuery({
    queryKey: ["payment-reports", orgId, from, to],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [pays, sums, contacts, companies] = await Promise.all([
        supabase
          .from("payments")
          .select("id, quotation_id, contact_id, company_id, receipt_number, amount, currency, payment_kind, payment_mode, reference, payment_date, status, created_at, contacts(full_name, primary_email, primary_phone), companies(name), quotations(title, total_amount)")
          .eq("organization_id", orgId)
          .eq("status", "valid")
          .gte("payment_date", from)
          .lte("payment_date", to)
          .order("payment_date"),
        supabase.from("quotation_payment_summary").select("*").eq("organization_id", orgId),
        supabase.from("contacts").select("id, full_name").eq("organization_id", orgId).limit(5000),
        supabase.from("companies").select("id, name").eq("organization_id", orgId).limit(5000),
      ]);
      if (pays.error) throw pays.error;
      if (sums.error) throw sums.error;
      return {
        payments: (pays.data ?? []).map((r) => normalizePayment(r as Record<string, unknown>)),
        summaries: (sums.data ?? []).map((r) => normalizeSummary(r as Record<string, unknown>)),
        contacts: new Map((contacts.data ?? []).map((c) => [c.id as string, c.full_name as string])),
        companies: new Map((companies.data ?? []).map((c) => [c.id as string, c.name as string])),
      };
    },
  });

  const rows = useMemo((): Record<string, string | number>[] => {
    const d = data.data;
    if (!d) return [];
    const cust = (c: string | null, co: string | null) => (c && d.contacts.get(c)) || (co && d.companies.get(co)) || "Unknown";

    if (report === "customer") {
      const m = new Map<string, { Customer: string; Payments: number; Received: number; "Quotation value": number; Outstanding: number }>();
      for (const s of d.summaries) {
        const k = s.contact_id ?? s.company_id ?? "-";
        const r = m.get(k) ?? { Customer: cust(s.contact_id, s.company_id), Payments: 0, Received: 0, "Quotation value": 0, Outstanding: 0 };
        r["Quotation value"] += s.total_amount;
        r.Outstanding += s.outstanding_amount;
        m.set(k, r);
      }
      for (const p of d.payments) {
        const k = p.contact_id ?? p.company_id ?? "-";
        const r = m.get(k) ?? { Customer: cust(p.contact_id, p.company_id), Payments: 0, Received: 0, "Quotation value": 0, Outstanding: 0 };
        r.Payments += 1;
        r.Received += p.amount;
        m.set(k, r);
      }
      return [...m.values()].sort((a, b) => b.Received - a.Received || b.Outstanding - a.Outstanding);
    }
    if (report === "quotation") {
      const inRange = new Map<string, { n: number; amt: number }>();
      for (const p of d.payments) {
        const r = inRange.get(p.quotation_id) ?? { n: 0, amt: 0 };
        r.n += 1;
        r.amt += p.amount;
        inRange.set(p.quotation_id, r);
      }
      return d.summaries.map((s) => ({
        Quotation: s.title,
        Customer: cust(s.contact_id, s.company_id),
        "Quotation amount": s.total_amount,
        "Received (in range)": inRange.get(s.quotation_id)?.amt ?? 0,
        "Received (total)": s.received_amount,
        Outstanding: s.outstanding_amount,
        Status: s.payment_status,
      }));
    }
    if (report === "date") {
      const m = new Map<string, { Date: string; Payments: number; Cash: number; UPI: number; "Bank Transfer": number; Total: number }>();
      for (const p of d.payments) {
        const r = m.get(p.payment_date) ?? { Date: p.payment_date, Payments: 0, Cash: 0, UPI: 0, "Bank Transfer": 0, Total: 0 };
        r.Payments += 1;
        r[MODE_LABEL[p.payment_mode] as "Cash" | "UPI" | "Bank Transfer"] += p.amount;
        r.Total += p.amount;
        m.set(p.payment_date, r);
      }
      return [...m.values()].sort((a, b) => a.Date.localeCompare(b.Date));
    }
    return d.summaries
      .filter((s) => s.outstanding_amount > 0)
      .sort((a, b) => b.outstanding_amount - a.outstanding_amount)
      .map((s) => ({
        Quotation: s.title,
        Customer: cust(s.contact_id, s.company_id),
        "Quotation amount": s.total_amount,
        Received: s.received_amount,
        Outstanding: s.outstanding_amount,
        Status: s.payment_status,
        "Last payment": s.last_payment_date ?? "",
      }));
  }, [data.data, report]);

  const exportReport = () => {
    const d = data.data;
    const detail =
      report === "date" && d
        ? d.payments.map((p) => ({
            Date: p.payment_date,
            "Invoice No": invoiceNumberFor(p.receipt_number),
            Customer: p.contacts?.full_name || p.companies?.name || "",
            Quotation: p.quotations?.title || "",
            Type: KIND_LABEL[p.payment_kind],
            Mode: MODE_LABEL[p.payment_mode],
            Reference: p.reference || "",
            Amount: p.amount,
          }))
        : null;
    downloadWorkbook(`${TITLES[report].toLowerCase().replace(/[^a-z]+/g, "-")}-${from}-to-${to}.xlsx`, detail && detail.length ? detail : rows, TITLES[report].slice(0, 31));
  };

  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const isMoney = (k: string) => /received|amount|outstanding|value|total|cash|upi|bank/i.test(k);
  const grand = cols.filter(isMoney).reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: rows.reduce((s, r) => s + Number(r[k] || 0), 0) }), {});

  return (
    <Card>
      <CardHeader
        title="Payment reports"
        subtitle={`${TITLES[report]} · payments dated ${fmtDate(from)} to ${fmtDate(to)}`}
        icon={<Wallet size={16} />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Payment report" value={report} onChange={(e) => setReport(e.target.value as Report)} className="w-auto">
              {(Object.keys(TITLES) as Report[]).map((k) => <option key={k} value={k}>{TITLES[k]}</option>)}
            </Select>
            <Button variant="secondary" size="sm" onClick={exportReport} disabled={!rows.length}>
              <Download size={15} /> Excel
            </Button>
          </div>
        }
      />
      {data.isLoading ? (
        <TableSkeleton rows={4} />
      ) : data.error ? (
        <ErrorBox message={`Could not load payment reports: ${(data.error as Error).message}`} />
      ) : !rows.length ? (
        <Empty title="No payment data for this range" />
      ) : (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead><tr>{cols.map((c) => <th key={c} className={isMoney(c) ? "text-right" : ""}>{c}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className={isMoney(c) ? "whitespace-nowrap text-right tabular-nums" : "max-w-[220px] truncate"}>
                      {c === "Status" ? <Badge tone={STATUS_TONE[String(r[c])] ?? "slate"}>{String(r[c])}</Badge>
                        : c === "Date" || c === "Last payment" ? fmtDate(String(r[c]) || null)
                        : isMoney(c) ? money(Number(r[c])) : String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                {cols.map((c, i) => (
                  <td key={c} className={isMoney(c) ? "whitespace-nowrap text-right tabular-nums" : ""}>
                    {i === 0 ? "Total" : grand[c] !== undefined ? money(grand[c]) : ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
