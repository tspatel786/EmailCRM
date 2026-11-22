import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { Button, Card } from "../ui";
import { RichTextEditor, type RichTextHandle } from "./RichTextEditor";
import { uploadInlineImage } from "./mailUtils";

/** Per-user email signature, added automatically to new mails, replies and forwards. */
export function SignatureCard() {
  const { org, user } = useSession();
  const editor = useRef<RichTextHandle>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const sig = useQuery({
    queryKey: ["my-signature", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("email_signature_html").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return (data?.email_signature_html as string | undefined) ?? "";
    },
  });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const html = editor.current?.getHtml() ?? "";
    const { error } = await supabase.from("profiles").update({ email_signature_html: html.length > 20000 ? html.slice(0, 20000) : html }).eq("id", user!.id);
    setSaving(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Signature saved." });
  };

  return (
    <Card className="mt-4 max-w-2xl space-y-3">
      <h2 className="font-medium">My email signature</h2>
      <p className="text-sm text-ink-600 dark:text-ink-300">Added automatically below new emails, replies and forwards you send from Mails. Each team member has their own.</p>
      {sig.isLoading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <RichTextEditor
          ref={editor}
          initialHtml={sig.data ?? ""}
          placeholder="e.g. Your name, title, phone number, website"
          minHeight={120}
          onInsertImage={org && user ? (f) => uploadInlineImage(org.organization_id, user.id, f) : undefined}
        />
      )}
      {msg ? <p className={msg.ok ? "text-sm text-emerald-700 dark:text-emerald-300" : "text-sm text-rose-700 dark:text-rose-300"}>{msg.text}</p> : null}
      <Button onClick={() => void save()} disabled={saving || sig.isLoading}>
        {saving ? "Saving..." : "Save signature"}
      </Button>
    </Card>
  );
}
