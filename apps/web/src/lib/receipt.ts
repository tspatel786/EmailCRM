// Payment receipt PDF, generated in the browser. jsPDF is loaded on demand so it does not
// add to the main bundle. Built-in PDF fonts have no ₹ glyph, so amounts use "INR".

export type ReceiptData = {
  orgName: string;
  receiptNumber: string;
  paymentDate: string;
  customerName: string;
  companyName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  quotationTitle: string;
  quotationTotal: number;
  amount: number;
  paidToDate: number;
  outstanding: number;
  mode: string;
  kind: string;
  reference?: string | null;
  notes?: string | null;
  currency: string;
  recordedBy?: string | null;
  isVoid?: boolean;
  voidReason?: string | null;
};

const MODE: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer" };
const KIND: Record<string, string> = { advance: "Advance", partial: "Partial", full: "Full" };

function amt(n: number, currency: string): string {
  return `${currency} ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function downloadReceiptPdf(d: ReceiptData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 18;
  let y = 0;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 38, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(M, 12, 14, 1.4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(d.orgName, M, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text("PAYMENT RECEIPT", M, 31);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(d.receiptNumber, W - M, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Date: ${d.paymentDate}`, W - M, 31, { align: "right" });

  y = 52;
  doc.setTextColor(23, 32, 51);

  const label = (t: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(t.toUpperCase(), x, yy);
  };
  const value = (t: string, x: number, yy: number, bold = false, size = 10.5) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(23, 32, 51);
    const lines = doc.splitTextToSize(t || "-", 80);
    doc.text(lines, x, yy);
    return lines.length;
  };

  label("Received from", M, y);
  let n = value(d.customerName, M, y + 6, true, 12);
  let yy = y + 6 + n * 5.5;
  if (d.companyName) { value(d.companyName, M, yy); yy += 5.5; }
  if (d.customerEmail) { value(d.customerEmail, M, yy, false, 9.5); yy += 5; }
  if (d.customerPhone) { value(d.customerPhone, M, yy, false, 9.5); yy += 5; }

  label("Against quotation", 115, y);
  n = value(d.quotationTitle, 115, y + 6, true, 11);
  value(`Quotation total: ${amt(d.quotationTotal, d.currency)}`, 115, y + 6 + n * 5.5, false, 9.5);

  y = Math.max(yy, y + 30) + 8;

  // Amount box
  doc.setFillColor(255, 247, 230);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(M, y, W - 2 * M, 24, 2, 2, "FD");
  label("Amount received", M + 6, y + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(23, 32, 51);
  doc.text(amt(d.amount, d.currency), M + 6, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${KIND[d.kind] ?? d.kind} payment`, W - M - 6, y + 11, { align: "right" });
  doc.text(`via ${MODE[d.mode] ?? d.mode}`, W - M - 6, y + 17.5, { align: "right" });
  y += 34;

  // Details table
  const rows: [string, string][] = [
    ["Receipt number", d.receiptNumber],
    ["Payment date", d.paymentDate],
    ["Payment mode", MODE[d.mode] ?? d.mode],
    ["Transaction reference", d.reference || "-"],
    ["Quotation amount", amt(d.quotationTotal, d.currency)],
    ["Total received to date", amt(d.paidToDate, d.currency)],
    ["Outstanding balance", amt(d.outstanding, d.currency)],
  ];
  doc.setDrawColor(226, 231, 239);
  for (const [k, v] of rows) {
    doc.line(M, y, W - M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(91, 102, 120);
    doc.text(k, M + 2, y + 6.5);
    doc.setTextColor(23, 32, 51);
    doc.setFont("helvetica", k === "Outstanding balance" ? "bold" : "normal");
    doc.text(v, W - M - 2, y + 6.5, { align: "right" });
    y += 10;
  }
  doc.line(M, y, W - M, y);
  y += 8;

  if (d.notes) {
    label("Notes", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(23, 32, 51);
    const lines = doc.splitTextToSize(d.notes, W - 2 * M);
    doc.text(lines, M, y + 6);
    y += 6 + lines.length * 4.6 + 4;
  }

  if (d.isVoid) {
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(48);
    doc.text("VOID", W / 2, 150, { align: "center", angle: 20 });
    doc.setFontSize(10);
    doc.text(`This payment was voided${d.voidReason ? `: ${d.voidReason}` : ""}`, M, y + 4);
  }

  // Footer
  doc.setDrawColor(226, 231, 239);
  doc.line(M, 270, W - M, 270);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Recorded by ${d.recordedBy || d.orgName} · Generated ${new Date().toLocaleString("en-IN")}`, M, 276);
  doc.text("This is a computer-generated receipt and does not require a signature.", M, 281);

  doc.save(`${d.receiptNumber}.pdf`);
}
