// WhatsApp Click-to-Chat (https://wa.me). Opens WhatsApp Web / the app with a pre-filled message;
// the user presses Send themselves. No API, no automation, nothing sent from our servers.
import { normalizeIndianMobile } from "@crm/shared";

/**
 * Converts a phone number to the digits wa.me expects (country code, no +).
 * Indian mobiles in any common format become 91XXXXXXXXXX. Other numbers must already include a
 * country code (+44…). Landlines and invalid numbers return null.
 */
export function toWhatsAppNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const indian = normalizeIndianMobile(raw);
  if (indian) return `91${indian}`;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.replace(/\D/g, "");
  // E.164: 8-15 digits. Indian numbers are handled above, so a +91 that failed is a landline.
  if (digits.startsWith("91") || digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function whatsAppLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export type WhatsAppContext = {
  name?: string | null;
  company?: string | null;
  senderName?: string | null;
  quotationTitle?: string | null;
  quotationAmount?: string | null;
  outstanding?: string | null;
  amountPaid?: string | null;
  invoiceNumber?: string | null;
};

export type WhatsAppTemplate = { id: string; label: string; build: (c: WhatsAppContext) => string };

const ORG = "S.M. PATEL IT HUB";
const hi = (c: WhatsAppContext) => `Namaste${c.name ? ` ${c.name}` : ""},`;
const sign = (c: WhatsAppContext) => `\n\nRegards,\n${c.senderName ? `${c.senderName}\n` : ""}${ORG}\nwww.smpatelithub.in | 9112427821`;

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "intro",
    label: "Introduction",
    build: (c) =>
      `${hi(c)}\n\nThis is from ${ORG}. We help businesses${c.company ? ` like ${c.company}` : ""} with websites, software, IT support and digital solutions.\n\nMay I share a short overview or set up a quick call?${sign(c)}`,
  },
  {
    id: "followup",
    label: "Follow-up",
    build: (c) => `${hi(c)}\n\nJust following up on our last conversation. Please let me know a convenient time to connect.${sign(c)}`,
  },
  {
    id: "quotation",
    label: "Quotation shared",
    build: (c) =>
      `${hi(c)}\n\nThank you for your interest. We have prepared the quotation${c.quotationTitle ? ` for "${c.quotationTitle}"` : ""}${c.quotationAmount ? ` amounting to ${c.quotationAmount}` : ""}. I am sharing the PDF here.\n\nPlease review it and let me know if you have any questions.${sign(c)}`,
  },
  {
    id: "reminder",
    label: "Payment reminder",
    build: (c) =>
      `${hi(c)}\n\nThis is a gentle reminder regarding the pending payment${c.quotationTitle ? ` for "${c.quotationTitle}"` : ""}.${c.outstanding ? `\nOutstanding balance: ${c.outstanding}` : ""}\n\nYou can pay by UPI or bank transfer. Please share the transaction reference after payment. Thank you!${sign(c)}`,
  },
  {
    id: "thanks",
    label: "Payment received",
    build: (c) =>
      `${hi(c)}\n\nWe have received your payment${c.amountPaid ? ` of ${c.amountPaid}` : ""}. Thank you!${c.invoiceNumber ? `\nInvoice no.: ${c.invoiceNumber}` : ""}${c.outstanding ? `\nBalance due: ${c.outstanding}` : ""}\n\nI am sharing the invoice PDF here.${sign(c)}`,
  },
  { id: "custom", label: "Custom message", build: (c) => `${hi(c)}\n\n${sign(c).trimStart()}` },
];
