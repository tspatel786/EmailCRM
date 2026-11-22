// Payment invoice on the S.M. PATEL IT HUB letterhead: one invoice per payment (replaces the
// plain receipt). No GST. Shows the quotation's items, the payment received, everything paid so
// far and the balance due. Number: INV-YYYY-NNNN, derived 1:1 from the payment's permanent
// receipt number, so it never changes and never repeats.
import { FOOTER_RATIO, FOOTER_SRC, HEADER_RATIO, HEADER_SRC, amountInWords, amt, toDataUrl, type QuotationPdfItem } from "./quotationPdf";

export type InvoicePdfData = {
  invoiceNumber: string;
  invoiceDate: string;
  quotationNumber: string;
  quotationTitle: string;
  currency: string;
  items: QuotationPdfItem[];
  quotationTotal: number;
  previouslyPaid: number;
  amount: number;
  paidToDate: number;
  balanceDue: number;
  mode: string;
  kind: string;
  reference?: string | null;
  notes?: string | null;
  customer: { name?: string | null; company?: string | null; email?: string | null; phone?: string | null; city?: string | null };
  orgName: string;
  preparedBy?: string | null;
  isVoid?: boolean;
  voidReason?: string | null;
};

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer" };
const KIND: Record<string, string> = { advance: "Advance payment", partial: "Part payment", full: "Full payment" };

export function invoiceNumberFor(receiptNumber: string): string {
  return receiptNumber.replace(/^RCPT-/, "INV-");
}

export async function downloadInvoicePdf(d: InvoicePdfData): Promise<void> {
  const [{ jsPDF }, header, footer] = await Promise.all([import("jspdf"), toDataUrl(HEADER_SRC), toDataUrl(FOOTER_SRC)]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  const headerH = W * HEADER_RATIO;
  const footerH = W * FOOTER_RATIO;
  const top = headerH + 6;
  const bottom = H - footerH - 6;
  const decorate = () => {
    doc.addImage(header, "JPEG", 0, 0, W, headerH, "lh-header", "FAST");
    doc.addImage(footer, "JPEG", 0, H - footerH, W, footerH, "lh-footer", "FAST");
  };
  decorate();
  let y = top;
  const ensure = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      decorate();
      y = top;
    }
  };
  const ink = () => doc.setTextColor(23, 32, 51);
  const muted = () => doc.setTextColor(100, 116, 139);

  // Title + meta
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  ink();
  doc.text("INVOICE", M, y + 4);
  doc.setFontSize(9.5);
  let my = y;
  for (const [k, v] of [["Invoice No.", d.invoiceNumber], ["Invoice date", d.invoiceDate], ["Quotation ref.", d.quotationNumber]] as const) {
    doc.setFont("helvetica", "normal");
    muted();
    doc.text(`${k}:`, W - M - 64, my);
    doc.setFont("helvetica", "bold");
    ink();
    doc.text(v, W - M, my, { align: "right" });
    my += 5;
  }
  y = Math.max(y + 10, my) + 3;
  doc.setDrawColor(226, 231, 239);
  doc.line(M, y, W - M, y);
  y += 6;

  // Bill to
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  muted();
  doc.text("BILL TO", M, y);
  y += 5;
  const names = [d.customer.name, d.customer.company].filter(Boolean) as string[];
  if (!names.length) names.push("Customer");
  names.forEach((n, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(i === 0 ? 11 : 10);
    ink();
    doc.text(n, M, y);
    y += 5;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const l of [d.customer.email, d.customer.phone, d.customer.city].filter(Boolean) as string[]) {
    doc.text(l, M, y);
    y += 4.6;
  }
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const subj = doc.splitTextToSize(`Project / Service: ${d.quotationTitle}`, W - 2 * M);
  doc.text(subj, M, y);
  y += subj.length * 5 + 4;

  // Items (from the quotation)
  const cols = { no: M, desc: M + 10, qty: W - M - 72, rate: W - M - 40, amount: W - M };
  const headRow = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(M, y, W - 2 * M, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("#", cols.no + 2, y + 5.4);
    doc.text("Description", cols.desc, y + 5.4);
    doc.text("Qty", cols.qty, y + 5.4, { align: "right" });
    doc.text("Rate", cols.rate, y + 5.4, { align: "right" });
    doc.text("Amount", cols.amount - 2, y + 5.4, { align: "right" });
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
  };
  ensure(20);
  headRow();
  const items = d.items.length ? d.items : [{ description: d.quotationTitle, quantity: 1, unit_price: d.quotationTotal }];
  items.forEach((it, i) => {
    const lines = doc.splitTextToSize(it.description || "-", cols.qty - cols.desc - 14);
    const rowH = Math.max(8, lines.length * 4.6 + 3.5);
    if (y + rowH > bottom) {
      doc.addPage();
      decorate();
      y = top;
      headRow();
    }
    if (i % 2 === 1) {
      doc.setFillColor(246, 248, 251);
      doc.rect(M, y, W - 2 * M, rowH, "F");
    }
    ink();
    doc.text(String(i + 1), cols.no + 2, y + 5.4);
    doc.text(lines, cols.desc, y + 5.4);
    doc.text(String(it.quantity), cols.qty, y + 5.4, { align: "right" });
    doc.text(amt(it.unit_price, d.currency), cols.rate, y + 5.4, { align: "right" });
    doc.text(amt(Number(it.quantity) * Number(it.unit_price), d.currency), cols.amount - 2, y + 5.4, { align: "right" });
    y += rowH;
    doc.setDrawColor(226, 231, 239);
    doc.line(M, y, W - M, y);
  });

  // Payment summary
  ensure(66);
  y += 10;
  const sx = W - M - 92;
  const sumRow = (label: string, value: string, opts: { bold?: boolean; fill?: [number, number, number]; color?: [number, number, number] } = {}) => {
    if (opts.fill) {
      doc.setFillColor(...opts.fill);
      doc.rect(sx, y - 5, 92, 8, "F");
    }
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.bold ? 10.5 : 9.5);
    if (opts.color) doc.setTextColor(...opts.color);
    else ink();
    doc.text(label, sx + 3, y);
    doc.text(value, W - M - 2, y, { align: "right" });
    y += 8;
  };
  sumRow("Total amount (quotation)", amt(d.quotationTotal, d.currency), { bold: true });
  sumRow("Paid earlier", amt(d.previouslyPaid, d.currency));
  sumRow(`This payment (${KIND[d.kind] ?? d.kind})`, amt(d.amount, d.currency), { bold: true, fill: [255, 247, 230] });
  sumRow("Total paid to date", amt(d.paidToDate, d.currency));
  sumRow("Balance due", amt(d.balanceDue, d.currency), {
    bold: true,
    fill: d.balanceDue > 0 ? [254, 242, 242] : [236, 253, 245],
    color: d.balanceDue > 0 ? [185, 28, 28] : [4, 120, 87],
  });

  // Payment details (left side, same vertical band)
  const py = y - 40;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  muted();
  doc.text("PAYMENT DETAILS", M, py);
  doc.setFontSize(9.5);
  ink();
  const details: [string, string][] = [
    ["Mode", MODE[d.mode] ?? d.mode],
    ["Reference", d.reference || "-"],
    ["Date", d.invoiceDate],
  ];
  details.forEach(([k, v], i) => {
    doc.setFont("helvetica", "normal");
    muted();
    doc.text(`${k}:`, M, py + 6 + i * 5.5);
    doc.setFont("helvetica", "bold");
    ink();
    doc.text(doc.splitTextToSize(v, sx - M - 30)[0] as string, M + 22, py + 6 + i * 5.5);
  });

  // "Fully paid" stamp sits in the free space under the payment details (no extra height).
  if (d.balanceDue <= 0 && !d.isVoid) {
    doc.setDrawColor(4, 120, 87);
    doc.setTextColor(4, 120, 87);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, py + 22, 42, 11, 2, 2, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("FULLY PAID", M + 21, py + 29.5, { align: "center" });
    doc.setLineWidth(0.2);
  }

  y += 2;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  muted();
  const words = doc.splitTextToSize(`Amount received in words: ${amountInWords(d.amount, d.currency)}`, W - 2 * M);
  doc.text(words, M, y);
  y += words.length * 4.4 + 4;

  if (d.notes) {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    ink();
    doc.text("Notes", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const line of doc.splitTextToSize(d.notes, W - 2 * M) as string[]) {
      ensure(5);
      doc.text(line, M, y);
      y += 4.6;
    }
    y += 3;
  }

  // Signature
  ensure(30);
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  ink();
  doc.text(`For ${d.orgName}`, W - M, y, { align: "right" });
  y += 18;
  doc.setDrawColor(148, 163, 184);
  doc.line(W - M - 55, y, W - M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  muted();
  doc.text("Authorised Signatory", W - M, y, { align: "right" });
  if (d.preparedBy) doc.text(`Prepared by: ${d.preparedBy}`, M, y);
  doc.setFontSize(8);
  doc.text("This is a computer-generated invoice.", M, Math.min(y + 6, bottom));

  if (d.isVoid) {
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p);
      doc.setTextColor(220, 38, 38);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(64);
      doc.text("VOID", W / 2, H / 2, { align: "center", angle: 25 });
    }
    doc.setFontSize(9);
    doc.text(`Voided${d.voidReason ? `: ${d.voidReason}` : ""}`, M, top - 1);
  }

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      muted();
      doc.text(`Page ${p} of ${pages}`, W - M, bottom + 4, { align: "right" });
    }
  }

  doc.save(`${d.invoiceNumber}.pdf`);
}
