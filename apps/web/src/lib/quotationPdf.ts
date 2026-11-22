// Quotation PDF on the S.M. PATEL IT HUB letterhead (header + footer images from the
// company's Word letterhead, repeated on every page). Generated in the browser; jsPDF is
// loaded on demand. Built-in PDF fonts have no ₹ glyph, so amounts use "Rs.".

export type QuotationPdfItem = { description: string; quantity: number; unit_price: number };

export type QuotationPdfData = {
  quotationNumber: string;
  title: string;
  date: string;
  validUntil: string;
  version: number;
  currency: string;
  items: QuotationPdfItem[];
  total: number;
  notesHtml?: string | null;
  customer: {
    name?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
  };
  preparedBy?: string | null;
  orgName: string;
};

const HEADER_SRC = "/letterhead/header.jpg";
const FOOTER_SRC = "/letterhead/footer.jpg";
// Pixel sizes of the letterhead images (2110 x 503 and 2110 x 293).
const HEADER_RATIO = 503 / 2110;
const FOOTER_RATIO = 293 / 2110;

async function toDataUrl(src: string): Promise<string> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Letterhead image missing (${src})`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read letterhead image"));
    r.readAsDataURL(blob);
  });
}

function htmlToPlain(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n");
  return (el.textContent ?? "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering: crore, lakh, thousand. */
export function amountInWords(amount: number, currency = "INR"): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${crore > 99 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  const unit = currency === "INR" ? "Rupees" : currency;
  const words = `${unit} ${parts.length ? parts.join(" ") : "Zero"}`;
  return `${words}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}

function amt(n: number, currency: string): string {
  const prefix = currency === "INR" ? "Rs." : currency;
  return `${prefix} ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function downloadQuotationPdf(d: QuotationPdfData): Promise<void> {
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
  const newPage = () => {
    doc.addPage();
    decorate();
    return top;
  };
  decorate();
  let y = top;
  const ensure = (needed: number) => {
    if (y + needed > bottom) y = newPage();
  };
  const ink = () => doc.setTextColor(23, 32, 51);
  const muted = () => doc.setTextColor(100, 116, 139);

  // Title row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  ink();
  doc.text("QUOTATION", M, y + 4);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  const meta: [string, string][] = [
    ["Quotation No.", d.quotationNumber],
    ["Date", d.date],
    ["Valid until", d.validUntil],
  ];
  let my = y;
  for (const [k, v] of meta) {
    muted();
    doc.text(`${k}:`, W - M - 64, my);
    ink();
    doc.setFont("helvetica", "bold");
    doc.text(v, W - M, my, { align: "right" });
    doc.setFont("helvetica", "normal");
    my += 5;
  }
  y = Math.max(y + 10, my) + 3;

  // Bill to + subject
  doc.setDrawColor(226, 231, 239);
  doc.line(M, y, W - M, y);
  y += 6;
  doc.setFontSize(8.5);
  muted();
  doc.text("TO", M, y);
  y += 5;
  ink();
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  const toLines = [d.customer.name, d.customer.company].filter(Boolean) as string[];
  if (!toLines.length) toLines.push("Customer");
  for (const [i, l] of toLines.entries()) {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(i === 0 ? 11 : 10);
    doc.text(l, M, y);
    y += 5;
  }
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  for (const l of [d.customer.email, d.customer.phone, d.customer.city].filter(Boolean) as string[]) {
    doc.text(l, M, y);
    y += 4.6;
  }
  y += 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const subj = doc.splitTextToSize(`Subject: ${d.title}`, W - 2 * M);
  doc.text(subj, M, y);
  y += subj.length * 5 + 4;

  // Items table
  const cols = { no: M, desc: M + 10, qty: W - M - 72, rate: W - M - 40, amount: W - M };
  const headerRow = () => {
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
  };
  ensure(20);
  headerRow();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const items = d.items.length ? d.items : [{ description: d.title, quantity: 1, unit_price: d.total }];
  items.forEach((it, i) => {
    const lines = doc.splitTextToSize(it.description || "-", cols.qty - cols.desc - 14);
    const rowH = Math.max(8, lines.length * 4.6 + 3.5);
    if (y + rowH > bottom) {
      y = newPage();
      headerRow();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
    }
    if (i % 2 === 1) {
      doc.setFillColor(246, 248, 251);
      doc.rect(M, y, W - 2 * M, rowH, "F");
    }
    ink();
    const lineAmt = Number(it.quantity) * Number(it.unit_price);
    doc.text(String(i + 1), cols.no + 2, y + 5.4);
    doc.text(lines, cols.desc, y + 5.4);
    doc.text(String(it.quantity), cols.qty, y + 5.4, { align: "right" });
    doc.text(amt(it.unit_price, d.currency), cols.rate, y + 5.4, { align: "right" });
    doc.text(amt(lineAmt, d.currency), cols.amount - 2, y + 5.4, { align: "right" });
    y += rowH;
    doc.setDrawColor(226, 231, 239);
    doc.line(M, y, W - M, y);
  });

  // Total
  ensure(22);
  y += 2;
  doc.setFillColor(255, 247, 230);
  doc.rect(W - M - 82, y, 82, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  ink();
  doc.text("Total", W - M - 78, y + 6.8);
  doc.text(amt(d.total, d.currency), W - M - 2, y + 6.8, { align: "right" });
  y += 14;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  muted();
  const words = doc.splitTextToSize(`Amount in words: ${amountInWords(d.total, d.currency)}`, W - 2 * M);
  doc.text(words, M, y);
  y += words.length * 4.4 + 5;

  // Notes / terms
  const notes = d.notesHtml ? htmlToPlain(d.notesHtml) : "";
  if (notes) {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    ink();
    doc.text("Notes & Terms", M, y);
    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const line of doc.splitTextToSize(notes, W - 2 * M) as string[]) {
      ensure(5);
      doc.text(line, M, y);
      y += 4.6;
    }
    y += 4;
  }

  // Signature
  ensure(30);
  y = Math.max(y + 6, y);
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

  // Page numbers
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      muted();
      doc.text(`Page ${p} of ${pages}`, W - M, bottom + 4, { align: "right" });
    }
  }

  doc.save(`${d.quotationNumber}.pdf`);
}
