import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { WHATSAPP_TEMPLATES, toWhatsAppNumber, whatsAppLink, type WhatsAppContext } from "../lib/whatsapp";
import { Button, Field, Input, Modal, Select, Textarea, cn } from "./ui";

type Props = {
  contactId?: string | null;
  phone?: string | null;
  context?: WhatsAppContext;
  defaultTemplate?: string;
  /** "icon" for table rows, "button" for headers. */
  variant?: "icon" | "button";
  className?: string;
};

/** WhatsApp Click-to-Chat with ready messages; logs the chat on the contact's timeline. */
export function WhatsAppButton({ contactId, phone, context = {}, defaultTemplate = "followup", variant = "icon", className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          title="WhatsApp"
          aria-label="Send WhatsApp message"
          onClick={() => setOpen(true)}
          className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10", className)}
        >
          <MessageCircle size={16} />
        </button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)} className={className}>
          <MessageCircle size={16} className="text-emerald-600 dark:text-emerald-400" /> WhatsApp
        </Button>
      )}
      {open ? <WhatsAppDialog contactId={contactId} phone={phone} context={context} defaultTemplate={defaultTemplate} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WhatsAppDialog({ contactId, phone, context, defaultTemplate, onClose }: Required<Pick<Props, "context" | "defaultTemplate">> & Pick<Props, "contactId" | "phone"> & { onClose: () => void }) {
  const { org, user } = useSession();
  const qc = useQueryClient();
  const [senderName, setSenderName] = useState<string | null>(null);
  const [number, setNumber] = useState(phone ?? "");
  const [templateId, setTemplateId] = useState(defaultTemplate);
  const [message, setMessage] = useState("");
  const [saveNumber, setSaveNumber] = useState(!phone);
  const [error, setError] = useState("");

  // Fill name / company / mobile from the contact when the caller only passed its id.
  const [contactInfo, setContactInfo] = useState<{ name?: string; company?: string } | null>(null);
  useEffect(() => {
    if (!contactId) return;
    void supabase
      .from("contacts")
      .select("full_name, company_name, primary_phone")
      .eq("id", contactId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setContactInfo({ name: data.full_name as string, company: (data.company_name as string | null) ?? undefined });
        const saved = data.primary_phone as string | null;
        if (saved && !phone) {
          setNumber((cur) => cur || saved);
          setSaveNumber(false);
        }
      });
  }, [contactId, phone]);

  useEffect(() => {
    if (!user) return;
    void supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => setSenderName((data?.full_name as string | undefined) ?? null));
  }, [user]);

  const ctx = useMemo(
    () => ({ ...context, name: context.name ?? contactInfo?.name, company: context.company ?? contactInfo?.company, senderName }),
    [context, contactInfo, senderName],
  );
  useEffect(() => {
    const t = WHATSAPP_TEMPLATES.find((x) => x.id === templateId) ?? WHATSAPP_TEMPLATES[0]!;
    setMessage(t.build(ctx));
  }, [templateId, ctx]);

  const waNumber = toWhatsAppNumber(number);
  const changedNumber = toWhatsAppNumber(phone) !== waNumber;

  const send = async () => {
    setError("");
    if (!waNumber) {
      setError("Enter a valid mobile number (10-digit Indian mobile, or +country code). Landlines cannot receive WhatsApp.");
      return;
    }
    if (!message.trim()) {
      setError("Message is empty.");
      return;
    }
    // Open first (synchronously from the click) so pop-up blockers allow it.
    window.open(whatsAppLink(waNumber, message.trim()), "_blank", "noopener");
    if (contactId && org && user) {
      const tasks: PromiseLike<unknown>[] = [
        supabase.from("activities").insert({
          organization_id: org.organization_id,
          contact_id: contactId,
          actor_user_id: user.id,
          activity_type: "note",
          summary: `WhatsApp: ${WHATSAPP_TEMPLATES.find((x) => x.id === templateId)?.label ?? "Message"} (+${waNumber})`,
          outcome: message.trim().slice(0, 500),
          occurred_at: new Date().toISOString(),
        }),
      ];
      if (saveNumber && changedNumber) {
        tasks.push(supabase.from("contacts").update({ primary_phone: `+${waNumber}` }).eq("id", contactId));
      }
      await Promise.all(tasks);
      qc.invalidateQueries({ queryKey: ["contact"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    }
    onClose();
  };

  return (
    <Modal size="md" open title="Send WhatsApp message" onClose={onClose}>
      <div className="space-y-4">
        <Field
          label="Mobile number"
          required
          hint={waNumber ? `Will open chat with +${waNumber}` : number ? "Not a valid mobile number (landlines do not work)" : "No mobile saved for this contact - enter one"}
        >
          <Input value={number} inputMode="tel" placeholder="98765 43210" onChange={(e) => setNumber(e.target.value)} autoFocus={!phone} />
        </Field>
        {contactId && changedNumber && waNumber ? (
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
            <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={saveNumber} onChange={(e) => setSaveNumber(e.target.checked)} />
            Save this number to the contact
          </label>
        ) : null}
        <Field label="Message template">
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {WHATSAPP_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Message" hint="You can edit the text. WhatsApp opens with this message ready; press Send there. Attach PDFs inside WhatsApp.">
          <Textarea rows={9} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
        </Field>
        {error ? <p role="alert" className="rounded-control border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-4 dark:border-ink-800 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => void send()} className="bg-emerald-600 hover:bg-emerald-700">
            <MessageCircle size={16} /> Open WhatsApp
          </Button>
        </div>
      </div>
    </Modal>
  );
}
