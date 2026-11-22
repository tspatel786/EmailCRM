import DOMPurify from "dompurify";
import { supabase } from "../../lib/supabase";

export type MailAttachment = { path: string; name: string; size: number; type: string };

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 10;
export const MAX_RECIPIENTS = 50;

// Must match the "mail-attachments" bucket allow-list in migration 0026.
export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  zip: "application/zip",
};
export const ACCEPT_ATTR = Object.keys(ALLOWED_TYPES).map((e) => `.${e}`).join(",");
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

/** Splits "a@x.com, B <b@y.com>; c@z.com" into bare addresses. */
export function parseAddresses(input: string): string[] {
  return input
    .split(/[,;\n]+/)
    .map((p) => (p.match(/<([^>]+)>/)?.[1] ?? p).trim())
    .filter(Boolean);
}

export function sanitizeComposerHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a", "b", "strong", "i", "em", "u", "s", "strike", "p", "div", "span", "br", "hr", "ul", "ol", "li",
      "blockquote", "h1", "h2", "h3", "h4", "font", "img", "table", "thead", "tbody", "tr", "td", "th", "pre", "code", "center",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "width", "height", "style", "color", "size", "face", "align", "colspan", "rowspan"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|cid:|#)/i,
  });
}

export function htmlToText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d|tr|blockquote)>/gi, "\n");
  return (el.textContent ?? "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES[ext]) return `${file.name}: file type .${ext || "?"} is not allowed`;
  if (file.size <= 0) return `${file.name}: file is empty`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: larger than 10 MB`;
  return null;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

export async function uploadAttachment(orgId: string, userId: string, file: File): Promise<MailAttachment> {
  const err = validateFile(file);
  if (err) throw new Error(err);
  const ext = file.name.split(".").pop()!.toLowerCase();
  const type = ALLOWED_TYPES[ext] ?? "application/octet-stream";
  const path = `${orgId}/${userId}/${crypto.randomUUID()}/${safeName(file.name)}`;
  const { error } = await supabase.storage.from("mail-attachments").upload(path, file, { contentType: type, upsert: false });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  return { path, name: file.name, size: file.size, type };
}

/** Inline images must be reachable by the recipient's mail client, so they go to the public "mail-images" bucket. */
export async function uploadInlineImage(orgId: string, userId: string, file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Only PNG, JPG, GIF or WEBP images can be inserted");
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller");
  const ext = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const path = `${orgId}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("mail-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("mail-images").getPublicUrl(path).data.publicUrl;
}

/** Copies another message's attachment into the current user's folder (used by Forward). */
export async function copyAttachment(orgId: string, userId: string, a: MailAttachment): Promise<MailAttachment> {
  const path = `${orgId}/${userId}/${crypto.randomUUID()}/${safeName(a.name)}`;
  const { error } = await supabase.storage.from("mail-attachments").copy(a.path, path);
  if (error) throw new Error(`${a.name}: ${error.message}`);
  return { ...a, path };
}

export async function signedUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from("mail-attachments").createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data) throw new Error(error?.message ?? "Could not open attachment");
  return data.signedUrl;
}

export function isPreviewable(type: string): boolean {
  return IMAGE_TYPES.includes(type) || type === "application/pdf" || type === "text/plain";
}

export function stripSubjectPrefix(subject: string): string {
  return subject.replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim();
}

export function quoteBlock(header: string, html: string): string {
  return `<br><br><div class="crm-quote">${escapeHtml(header)}<blockquote style="margin:0 0 0 0.8ex;border-left:2px solid #cbd5e1;padding-left:1ex;color:#475569">${sanitizeComposerHtml(html)}</blockquote></div>`;
}
