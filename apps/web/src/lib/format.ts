import { format, formatDistanceToNow, isToday, parseISO } from "date-fns";

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy");
  } catch {
    return value;
  }
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy HH:mm");
  } catch {
    return value;
  }
}

export function fmtRelative(value?: string | null): string {
  if (!value) return "";
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch {
    return "";
  }
}

export function todayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function isIsoToday(value: string): boolean {
  try {
    return isToday(parseISO(value));
  } catch {
    return false;
  }
}

export function money(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function telHref(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return `tel:${cleaned}`;
}
