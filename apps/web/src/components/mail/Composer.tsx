import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { personalize } from "@crm/shared";
import {
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { Button, cn } from "../ui";
import { RichTextEditor, type RichTextHandle } from "./RichTextEditor";
import {
  ACCEPT_ATTR,
  MAX_FILES,
  MAX_RECIPIENTS,
  MAX_TOTAL_BYTES,
  formatBytes,
  htmlToText,
  isEmail,
  isPreviewable,
  parseAddresses,
  sanitizeComposerHtml,
  signedUrl,
  uploadAttachment,
  uploadInlineImage,
  validateFile,
  type MailAttachment,
} from "./mailUtils";

export type ComposerInit = {
  draftId?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  contactId?: string | null;
  companyId?: string | null;
  inReplyTo?: string | null;
  threadId?: string | null;
  attachments?: MailAttachment[];
  title?: string;
};

const FROM_EMAIL = "sales@updates.smpatelithub.in";

function RecipientField({
  label,
  values,
  onChange,
  suggestions,
  autoFocus,
  trailing,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions: { email: string; name: string }[];
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const commit = (raw: string) => {
    const add = parseAddresses(raw).filter((a) => !values.some((v) => v.toLowerCase() === a.toLowerCase()));
    if (add.length) onChange([...values, ...add]);
    setText("");
  };
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 1) return [];
    return suggestions
      .filter((s) => !values.includes(s.email) && (s.email.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [text, suggestions, values]);

  return (
    <div className="relative flex min-h-11 items-start gap-2 border-b border-ink-100 px-4 py-1.5 dark:border-ink-800">
      <span className="w-9 shrink-0 pt-1.5 text-sm text-ink-500 dark:text-ink-400">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs",
              isEmail(v)
                ? "bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-200"
                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
            )}
            title={isEmail(v) ? v : "Invalid email address"}
          >
            <span className="truncate">{v}</span>
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded-full p-0.5 hover:bg-black/10">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          autoFocus={autoFocus}
          value={text}
          aria-label={label}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]\s*$/.test(v)) commit(v);
            else {
              setText(v);
              setOpen(true);
            }
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if ((e.key === "Enter" || e.key === "Tab") && text.trim()) {
              e.preventDefault();
              commit(matches[0] && !isEmail(text) ? matches[0].email : text);
            } else if (e.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 150);
            if (text.trim()) commit(text);
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[,;\n]/.test(t)) {
              e.preventDefault();
              commit(t);
            }
          }}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-ink-100"
        />
      </div>
      {trailing}
      {open && matches.length ? (
        <ul className="absolute left-14 right-4 top-full z-30 mt-1 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-pop dark:border-ink-700 dark:bg-ink-900">
          {matches.map((m) => (
            <li key={m.email}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange([...values, m.email]); setText(""); }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-ink-50 dark:hover:bg-ink-800">
                <span className="text-sm font-medium text-ink-900 dark:text-white">{m.name}</span>
                <span className="text-xs text-ink-500 dark:text-ink-400">{m.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Composer({ init, onClose }: { init: ComposerInit; onClose: () => void }) {
  const { org, user } = useSession();
  const qc = useQueryClient();
  const orgId = org?.organization_id ?? "";
  const userId = user?.id ?? "";
  const editor = useRef<RichTextHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draftId, setDraftId] = useState<string | null>(init.draftId ?? null);
  const [to, setTo] = useState<string[]>(init.to ?? []);
  const [cc, setCc] = useState<string[]>(init.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(init.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(init.cc?.length || init.bcc?.length));
  const [subject, setSubject] = useState(init.subject ?? "");
  const [contactId, setContactId] = useState(init.contactId ?? "");
  const [companyId, setCompanyId] = useState(init.companyId ?? "");
  const [attachments, setAttachments] = useState<MailAttachment[]>(init.attachments ?? []);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"send" | "save" | "discard" | null>(null);
  const [mode, setMode] = useState<"normal" | "min" | "max">("normal");
  const [preview, setPreview] = useState<{ name: string; url: string; type: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const dirty = useRef(false);
  const saving = useRef<Promise<string | null> | null>(null);

  const lookups = useQuery({
    queryKey: ["composer-lookups", orgId],
    enabled: Boolean(orgId),
    staleTime: 60_000,
    queryFn: async () => {
      const [contacts, companies, templates, profile] = await Promise.all([
        supabase.from("contacts").select("id, full_name, primary_email, primary_phone, city, service_interest, company_name, company_id").eq("organization_id", orgId).is("archived_at", null).order("full_name").limit(2000),
        supabase.from("companies").select("id, name").eq("organization_id", orgId).is("archived_at", null).order("name").limit(2000),
        supabase.from("email_templates").select("id, name, subject, body_text, body_html").eq("organization_id", orgId).is("archived_at", null).order("name"),
        supabase.from("profiles").select("email_signature_html, full_name").eq("id", userId).maybeSingle(),
      ]);
      return {
        contacts: contacts.data ?? [],
        companies: companies.data ?? [],
        templates: templates.data ?? [],
        signature: (profile.data?.email_signature_html as string | undefined) ?? "",
        senderName: (profile.data?.full_name as string | undefined) ?? "",
      };
    },
  });
  const contacts = lookups.data?.contacts ?? [];
  const suggestions = useMemo(
    () => contacts.filter((c) => c.primary_email).map((c) => ({ email: c.primary_email as string, name: c.full_name })),
    [contacts],
  );

  // Signature: added once to a new message (not to drafts being re-opened).
  const signatureAdded = useRef(Boolean(init.draftId));
  useEffect(() => {
    const sig = lookups.data?.signature;
    if (signatureAdded.current || lookups.isLoading) return;
    signatureAdded.current = true;
    if (sig && editor.current) {
      const current = editor.current.getHtml();
      const sigBlock = `<div class="crm-signature"><br>-- <br>${sanitizeComposerHtml(sig)}</div>`;
      // Replies/forwards: signature goes above the quoted text, like Gmail.
      const idx = current.indexOf('<div class="crm-quote">');
      editor.current.setHtml(idx >= 0 ? current.slice(0, idx) + sigBlock + current.slice(idx) : current + sigBlock);
      dirty.current = false;
    }
  }, [lookups.data, lookups.isLoading]);

  // Auto-link the contact (and their company) when the first To address matches a contact.
  useEffect(() => {
    if (contactId || !to[0]) return;
    const match = contacts.find((c) => c.primary_email?.toLowerCase() === to[0]?.toLowerCase());
    if (match) {
      setContactId(match.id);
      if (!companyId && match.company_id) setCompanyId(match.company_id);
    }
  }, [to, contacts, contactId, companyId]);

  useEffect(() => {
    dirty.current = true;
  }, [to, cc, bcc, subject, contactId, companyId, attachments]);

  const row = (folder: "draft" | "queued") => {
    const html = editor.current?.getHtml() ?? "";
    return {
      organization_id: orgId,
      owner_user_id: userId,
      direction: "outbound",
      folder,
      status: folder,
      from_name: lookups.data?.senderName ? `${lookups.data.senderName} · ${org?.organizations?.name ?? "S.M.PATEL IT HUB"}` : org?.organizations?.name || "S.M.PATEL IT HUB",
      from_email: FROM_EMAIL,
      to_email: to[0] ?? "",
      to_name: to[0] ?? "",
      cc: [...to.slice(1), ...cc],
      bcc,
      subject: subject.trim() || "(No Subject)",
      body_html: html,
      body_text: htmlToText(html),
      contact_id: contactId || null,
      company_id: companyId || null,
      attachments,
      in_reply_to: init.inReplyTo ?? null,
      thread_id: init.threadId ?? null,
      provider: "resend",
    };
  };

  const saveDraft = async (silent = false): Promise<string | null> => {
    if (saving.current) return saving.current;
    const p = (async () => {
      const payload = row("draft");
      if (draftId) {
        const { error: e } = await supabase.from("messages").update(payload).eq("id", draftId);
        if (e) throw e;
        return draftId;
      }
      const { data, error: e } = await supabase.from("messages").insert(payload).select("id").single();
      if (e) throw e;
      setDraftId(data.id);
      return data.id as string;
    })();
    saving.current = p;
    try {
      const id = await p;
      dirty.current = false;
      if (!silent) setStatus("Draft saved");
      else setStatus(`Draft saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      qc.invalidateQueries({ queryKey: ["messages", orgId] });
      return id;
    } finally {
      saving.current = null;
    }
  };

  // Auto-save every 20s while there are unsaved changes and something worth saving.
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty.current || busy) return;
      const html = editor.current?.getHtml() ?? "";
      if (!to.length && !subject.trim() && !htmlToText(html) && !attachments.length) return;
      saveDraft(true).catch(() => undefined);
    }, 20_000);
    return () => clearInterval(t);
  });

  const msg = (e: unknown) =>
    e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);

  const send = async () => {
    setError("");
    const all = [...to, ...cc, ...bcc];
    if (!to.length) return setError("Add at least one recipient in To.");
    const bad = all.filter((a) => !isEmail(a));
    if (bad.length) return setError(`Invalid email address: ${bad.join(", ")}`);
    if (all.length > MAX_RECIPIENTS) return setError(`Too many recipients (max ${MAX_RECIPIENTS}).`);
    if (uploading.length) return setError("Wait for attachments to finish uploading.");
    const html = editor.current?.getHtml() ?? "";
    if (!htmlToText(html) && !attachments.length && !/<img/i.test(html)) return setError("The message is empty.");
    if (!subject.trim() && !window.confirm("Send this message without a subject?")) return;

    setBusy("send");
    try {
      if (saving.current) await saving.current.catch(() => undefined);
      const payload = row("queued");
      if (draftId) {
        const { error: e } = await supabase.from("messages").update(payload).eq("id", draftId);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("messages").insert(payload);
        if (e) throw e;
      }
      if (contactId) {
        await supabase.from("activities").insert({
          organization_id: orgId,
          contact_id: contactId,
          actor_user_id: userId,
          activity_type: "email",
          summary: `Sent email: ${subject.trim() || "(No Subject)"}`,
          outcome: htmlToText(html).slice(0, 500),
          occurred_at: new Date().toISOString(),
        });
      }
      qc.invalidateQueries({ queryKey: ["messages", orgId] });
      onClose();
    } catch (e) {
      setError(msg(e) || "Could not send. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard this message?")) return;
    setBusy("discard");
    try {
      if (saving.current) await saving.current.catch(() => undefined);
      if (draftId) {
        const { error: e } = await supabase.from("messages").delete().eq("id", draftId).eq("folder", "draft");
        if (e) throw e;
      }
      // Remove files uploaded for this message only (forwarded copies included).
      const own = attachments.filter((a) => a.path.startsWith(`${orgId}/${userId}/`)).map((a) => a.path);
      if (own.length) await supabase.storage.from("mail-attachments").remove(own);
      qc.invalidateQueries({ queryKey: ["messages", orgId] });
      onClose();
    } catch (e) {
      setError(msg(e));
      setBusy(null);
    }
  };

  const closeKeepingDraft = async () => {
    const html = editor.current?.getHtml() ?? "";
    const hasContent = to.length || subject.trim() || htmlToText(html) || attachments.length;
    if (dirty.current && hasContent) {
      try {
        await saveDraft(true);
      } catch (e) {
        if (!window.confirm(`Could not save the draft (${msg(e)}). Close anyway?`)) return;
      }
    }
    onClose();
  };

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setError("");
    const list = [...files];
    if (attachments.length + list.length > MAX_FILES) return setError(`You can attach up to ${MAX_FILES} files.`);
    const total = attachments.reduce((s, a) => s + a.size, 0) + list.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL_BYTES) return setError("Attachments can be at most 20 MB in total.");
    for (const f of list) {
      const err = validateFile(f);
      if (err) return setError(err);
    }
    for (const f of list) {
      setUploading((u) => [...u, f.name]);
      try {
        const a = await uploadAttachment(orgId, userId, f);
        setAttachments((cur) => [...cur, a]);
      } catch (e) {
        setError(msg(e));
      } finally {
        setUploading((u) => u.filter((n) => n !== f.name));
      }
    }
  };

  const removeAttachment = async (a: MailAttachment) => {
    setAttachments((cur) => cur.filter((x) => x.path !== a.path));
    // Only delete files this message uploaded; never someone else's original.
    if (a.path.startsWith(`${orgId}/${userId}/`)) await supabase.storage.from("mail-attachments").remove([a.path]);
  };

  const openPreview = async (a: MailAttachment) => {
    try {
      const url = await signedUrl(a.path);
      if (isPreviewable(a.type)) setPreview({ name: a.name, url, type: a.type });
      else window.open(await signedUrl(a.path, a.name), "_blank", "noopener");
    } catch (e) {
      setError(msg(e));
    }
  };

  const applyTemplate = (t: { subject: string; body_text: string; body_html: string }) => {
    const c = contacts.find((x) => x.id === contactId) ?? contacts.find((x) => x.primary_email?.toLowerCase() === to[0]?.toLowerCase());
    const vars = c
      ? { name: c.full_name, company: c.company_name, service: c.service_interest, email: c.primary_email, phone: c.primary_phone, city: c.city }
      : { email: to[0] };
    const bodyHtml = t.body_html?.trim() ? t.body_html : t.body_text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    if (!subject.trim()) setSubject(personalize(t.subject, vars));
    editor.current?.insertHtml(personalize(bodyHtml, vars));
    setShowTemplates(false);
    if (!c) setStatus("Template inserted. Pick a CRM contact first to fill {{name}}, {{company}} and other variables.");
  };

  const totalSize = attachments.reduce((s, a) => s + a.size, 0);
  const title = init.title ?? "New message";

  // Minimised: a compact bar like Gmail's.
  if (mode === "min") {
    return (
      <div className="fixed bottom-0 right-4 z-50 w-72 overflow-hidden rounded-t-xl border border-ink-200 bg-ink-900 shadow-pop dark:border-ink-700">
        <button type="button" onClick={() => setMode("normal")} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold text-white">
          <span className="truncate">{subject || title}</span>
          <span className="flex items-center gap-1">
            <Maximize2 size={14} />
            <span role="button" tabIndex={0} aria-label="Close" onClick={(e) => { e.stopPropagation(); void closeKeepingDraft(); }}><X size={15} /></span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      {mode === "max" ? <div className="fixed inset-0 z-40 bg-ink-950/40" onClick={() => setMode("normal")} aria-hidden /> : null}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border border-ink-200 bg-white shadow-pop dark:border-ink-700 dark:bg-ink-900",
          // Phones: full screen. Tablet/desktop: docked bottom-right like Gmail, or centred when maximised.
          "inset-0 sm:inset-auto",
          mode === "max"
            ? "sm:left-1/2 sm:top-1/2 sm:h-[88vh] sm:w-[min(1000px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
            : "sm:bottom-0 sm:right-4 sm:h-[min(640px,92vh)] sm:w-[min(600px,calc(100vw-2rem))] sm:rounded-t-xl",
        )}
      >
        {/* Title bar */}
        <div className="flex shrink-0 items-center justify-between bg-ink-900 px-4 py-2.5 text-white dark:bg-ink-950">
          <span className="truncate text-sm font-semibold">{title}</span>
          <div className="flex items-center gap-0.5">
            <button type="button" title="Minimise" aria-label="Minimise" onClick={() => setMode("min")} className="hidden rounded p-1.5 hover:bg-white/10 sm:block"><Minus size={15} /></button>
            <button type="button" title={mode === "max" ? "Exit full screen" : "Full screen"} aria-label="Toggle full screen" onClick={() => setMode(mode === "max" ? "normal" : "max")} className="hidden rounded p-1.5 hover:bg-white/10 sm:block">
              {mode === "max" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button type="button" title="Save & close" aria-label="Save and close" onClick={() => void closeKeepingDraft()} className="rounded p-1.5 hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            if (e.dataTransfer.files.length) {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }
          }}
        >
          <RecipientField
            label="To"
            values={to}
            onChange={setTo}
            suggestions={suggestions}
            autoFocus={!to.length}
            trailing={
              !showCc ? (
                <button type="button" onClick={() => setShowCc(true)} className="shrink-0 pt-1.5 text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white">
                  Cc Bcc
                </button>
              ) : null
            }
          />
          {showCc ? (
            <>
              <RecipientField label="Cc" values={cc} onChange={setCc} suggestions={suggestions} />
              <RecipientField label="Bcc" values={bcc} onChange={setBcc} suggestions={suggestions} />
            </>
          ) : null}
          <div className="flex items-center border-b border-ink-100 px-4 dark:border-ink-800">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              maxLength={300}
              className="min-h-11 w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-ink-100"
            />
          </div>

          {/* CRM links */}
          <div className="grid gap-2 border-b border-ink-100 px-4 py-2 sm:grid-cols-2 dark:border-ink-800">
            <label className="flex min-w-0 items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
              <span className="shrink-0">Contact</span>
              <select
                value={contactId}
                onChange={(e) => {
                  const id = e.target.value;
                  setContactId(id);
                  const c = contacts.find((x) => x.id === id);
                  if (c?.primary_email && !to.length) setTo([c.primary_email]);
                  if (c?.company_id && !companyId) setCompanyId(c.company_id);
                }}
                className="min-h-8 min-w-0 flex-1 truncate rounded-md border border-ink-200 bg-white px-2 text-xs text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
              >
                <option value="">Not linked</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                    {c.primary_email ? ` (${c.primary_email})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
              <span className="shrink-0">Company</span>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="min-h-8 min-w-0 flex-1 truncate rounded-md border border-ink-200 bg-white px-2 text-xs text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
              >
                <option value="">Not linked</option>
                {(lookups.data?.companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="p-3">
            <RichTextEditor
              ref={editor}
              initialHtml={init.bodyHtml ?? ""}
              onChange={() => { dirty.current = true; }}
              onInsertImage={(f) => uploadInlineImage(orgId, userId, f)}
              minHeight={mode === "max" ? 360 : 200}
            />

            {attachments.length || uploading.length ? (
              <div className="mt-3 space-y-1.5">
                {attachments.map((a) => (
                  <div key={a.path} className="flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800/60">
                    <FileText size={16} className="shrink-0 text-primary-600 dark:text-primary-400" />
                    <button type="button" onClick={() => void openPreview(a)} className="min-w-0 flex-1 truncate text-left font-medium text-ink-800 hover:underline dark:text-ink-200" title="Preview">
                      {a.name}
                    </button>
                    <span className="shrink-0 text-xs text-ink-500">{formatBytes(a.size)}</span>
                    <button type="button" onClick={() => void openPreview(a)} aria-label={`Preview ${a.name}`} className="rounded p-1 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700"><Eye size={14} /></button>
                    <button type="button" onClick={() => void removeAttachment(a)} aria-label={`Remove ${a.name}`} className="rounded p-1 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700"><X size={14} /></button>
                  </div>
                ))}
                {uploading.map((n) => (
                  <div key={n} className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-2 text-sm text-ink-500 dark:border-ink-600">
                    <Loader2 size={15} className="animate-spin" /> Uploading {n}…
                  </div>
                ))}
                <p className="text-2xs text-ink-400">{formatBytes(totalSize)} of 20 MB</p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-ink-100 px-3 py-2.5 dark:border-ink-800">
          <Button type="button" onClick={() => void send()} disabled={busy !== null}>
            {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send
          </Button>
          <button type="button" title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">
            <Paperclip size={17} />
          </button>
          <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          <div className="relative">
            <button type="button" onClick={() => setShowTemplates((v) => !v)} disabled={!lookups.data?.templates.length}
              className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-ink-600 hover:bg-ink-100 disabled:opacity-40 dark:text-ink-300 dark:hover:bg-ink-800">
              Templates <ChevronDown size={14} />
            </button>
            {showTemplates ? (
              <div className="absolute bottom-11 left-0 z-30 max-h-64 w-64 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900">
                {(lookups.data?.templates ?? []).map((t) => (
                  <button key={t.id} type="button" onClick={() => applyTemplate(t)} className="block w-full truncate rounded px-3 py-2 text-left text-sm text-ink-800 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800">
                    {t.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void saveDraft().catch((e) => setError(msg(e)))} disabled={busy !== null}>
            Save draft
          </Button>
          <span className="min-w-0 flex-1 truncate text-right text-2xs text-ink-400">{status || `From ${FROM_EMAIL}`}</span>
          <button type="button" title="Discard" aria-label="Discard" onClick={() => void discard()} disabled={busy !== null}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/70 p-4" onClick={() => setPreview(null)}>
          <div className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white dark:bg-ink-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5 dark:border-ink-800">
              <span className="truncate text-sm font-semibold text-ink-900 dark:text-white">{preview.name}</span>
              <button type="button" aria-label="Close preview" onClick={() => setPreview(null)} className="rounded p-1 hover:bg-ink-100 dark:hover:bg-ink-800"><X size={16} /></button>
            </div>
            {preview.type.startsWith("image/") ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-ink-50 p-4 dark:bg-ink-950">
                <img src={preview.url} alt={preview.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              // The signed URL is on the Supabase storage origin, never the CRM origin. Chrome's PDF
              // viewer does not run inside a sandboxed iframe, so only plain text gets a sandbox.
              <iframe title={preview.name} src={preview.url} sandbox={preview.type === "application/pdf" ? undefined : ""} className="min-h-0 flex-1 border-0 bg-white" />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
