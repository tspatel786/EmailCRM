import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import DOMPurify from "dompurify";
import { canManageCampaigns, personalize, templateFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { invokeFunction, supabase } from "../lib/supabase";
import { Button, Card, Confirm, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Textarea } from "../components/ui";

type Form = z.infer<typeof templateFormSchema>;
type Template = { id: string; name: string; subject: string; body_text: string; body_html: string };

export function TemplatesPage() {
  const { org, user } = useSession();
  const manage = canManageCampaigns(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Demo Email States
  const [demoTarget, setDemoTarget] = useState<Template | null>(null);
  const [demoEmail, setDemoEmail] = useState("");
  const [demoVars, setDemoVars] = useState({
    name: "Priya Sharma",
    company: "Northwind IT Solutions",
    service: "Managed IT & Cloud Security",
    phone: "+91 98765 43210",
    city: "Mumbai",
  });
  const [demoStatus, setDemoStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [demoMessage, setDemoMessage] = useState("");
  const [postSaveNotice, setPostSaveNotice] = useState<Template | null>(null);

  const form = useForm<Form>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: { name: "", subject: "", body_text: "", body_html: "" },
  });
  const preview = personalize(form.watch("body_text") || form.watch("body_html") || "", {
    name: "Priya",
    company: "Northwind",
    service: "Managed IT",
  });

  const list = useQuery({
    queryKey: ["templates", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("organization_id", org!.organization_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  function openCreate() {
    setEditTarget(null);
    save.reset();
    form.clearErrors();
    form.reset({ name: "", subject: "", body_text: "", body_html: "" });
    setOpen(true);
  }

  function openEdit(t: Template) {
    setEditTarget(t);
    save.reset();
    form.clearErrors();
    form.reset({ name: t.name, subject: t.subject, body_text: t.body_text, body_html: t.body_html });
    setOpen(true);
  }

  function openDemoModal(t: Template) {
    setDemoTarget(t);
    setDemoEmail(user?.email || "");
    setDemoStatus("idle");
    setDemoMessage("");
  }

  const save = useMutation({
    mutationFn: async (values: Form) => {
      if (!org?.organization_id) throw new Error("No organization selected");
      const plainText = values.body_text?.trim()
        ? values.body_text
        : (values.body_html ? values.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

      const payload = {
        name: values.name.trim(),
        subject: values.subject.trim(),
        body_text: plainText,
        body_html: DOMPurify.sanitize(values.body_html || ""),
      };

      if (editTarget) {
        const { data, error } = await supabase.from("email_templates").update(payload).eq("id", editTarget.id).select().single();
        if (error) throw error;
        return data as Template;
      } else {
        const { data, error } = await supabase.from("email_templates").insert({ ...payload, organization_id: org.organization_id }).select().single();
        if (error) throw error;
        return data as Template;
      }
    },
    onSuccess: async (savedTemplate) => {
      await qc.invalidateQueries({ queryKey: ["templates"] });
      await qc.refetchQueries({ queryKey: ["templates"] });
      setOpen(false);
      setEditTarget(null);
      form.reset();

      // Open post-save prompt so user can immediately trigger a demo mail!
      if (savedTemplate) {
        setPostSaveNotice(savedTemplate);
      }
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").update({ archived_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["templates"] });
      await qc.refetchQueries({ queryKey: ["templates"] });
      setDeleteTarget(null);
    },
  });

  async function triggerDemoEmail() {
    if (!demoTarget || !org?.organization_id) return;
    const targetEmail = demoEmail.trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      setDemoStatus("error");
      setDemoMessage("Please enter a valid recipient email address.");
      return;
    }

    setDemoStatus("sending");
    setDemoMessage("Queuing demo email with SMTP worker...");

    const pVars = { ...demoVars, email: targetEmail };
    const personalizedSubject = personalize(demoTarget.subject || "Template Demo", pVars);
    const personalizedText = personalize(demoTarget.body_text || "", pVars);
    const personalizedHtml = personalize(demoTarget.body_html || "", pVars);

    try {
      const { data, error } = await supabase.from("demo_email_requests").insert({
        organization_id: org.organization_id,
        template_id: demoTarget.id && !demoTarget.id.startsWith("preview") ? demoTarget.id : null,
        requested_by: user?.id ?? null,
        recipient_email: targetEmail,
        subject: personalizedSubject,
        body_text: personalizedText || personalizedHtml.replace(/<[^>]+>/g, " ").trim(),
        body_html: personalizedHtml || `<div style="font-family:sans-serif;line-height:1.6;color:#334155;"><p>${personalizedText}</p></div>`,
        status: "pending",
      }).select().single();

      if (error) {
        // Fallback: try edge function if direct table write is blocked
        const efRes = await invokeFunction<{ success?: boolean; error?: string }>("send-demo-email", {
          organization_id: org.organization_id,
          recipient_email: targetEmail,
          subject: personalizedSubject,
          body_text: personalizedText,
          body_html: personalizedHtml,
          template_id: demoTarget.id,
        }).catch((e: Error) => ({ error: e.message }));

        if (efRes && !efRes.error) {
          setDemoStatus("sent");
          setDemoMessage(`✅ Demo email queued successfully for ${targetEmail}!`);
          return;
        }

        throw error;
      }

      setDemoStatus("sending");
      setDemoMessage(`Demo email queued! Waiting for SMTP worker dispatch to ${targetEmail}...`);

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const { data: updated } = await supabase
          .from("demo_email_requests")
          .select("status, error_message")
          .eq("id", data.id)
          .single();

        if (updated?.status === "sent") {
          clearInterval(interval);
          setDemoStatus("sent");
          setDemoMessage(`✅ Demo email sent successfully to ${targetEmail}! Check your inbox.`);
        } else if (updated?.status === "failed") {
          clearInterval(interval);
          setDemoStatus("error");
          setDemoMessage(`❌ Delivery failed: ${updated.error_message || "SMTP error"}`);
        } else if (attempts >= 6) {
          clearInterval(interval);
          setDemoStatus("sent");
          setDemoMessage(`🚀 Demo email queued and dispatching to ${targetEmail}. Check your inbox shortly!`);
        }
      }, 1500);

    } catch (err: any) {
      console.error("Failed to send demo email:", err);
      setDemoStatus("error");
      setDemoMessage(
        err.message ||
        "Failed to trigger demo email. Please verify migration 0013_demo_email.sql is applied."
      );
    }
  }

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Variables: {{name}}, {{company}}, {{service}}, {{email}}, {{phone}}, {{city}}"
        actions={manage ? <Button onClick={openCreate}>New template</Button> : null}
      />

      {/* Post-Save Demo Email Trigger Notification Banner */}
      {postSaveNotice && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50/90 p-4 flex flex-wrap items-center justify-between gap-3 text-emerald-950 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <p className="font-bold text-sm">Template "{postSaveNotice.name}" saved successfully! (टेंप्लेट सेव्ह झाले)</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Would you like to trigger a demo email to test how it looks in an actual inbox?
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const t = postSaveNotice;
                setPostSaveNotice(null);
                openDemoModal(t);
              }}
            >
              🚀 Send Demo Mail (डेमो मेल पाठवा)
            </Button>
            <Button variant="ghost" onClick={() => setPostSaveNotice(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {list.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : list.error ? (
        <ErrorBox message={(list.error as Error).message || "Failed to load email templates"} />
      ) : !list.data?.length ? (
        <Empty title="No templates" hint="Create your first reusable email template for campaigns and quick outreach." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-slate-900">{t.name}</h3>
                  <p className="text-sm text-slate-500">{t.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600 line-clamp-4 bg-slate-50 p-2 rounded-lg border border-slate-100">{t.body_text || t.body_html}</pre>
                </div>
                <div className="flex shrink-0 flex-col sm:flex-row gap-1">
                  <Button variant="secondary" onClick={() => openDemoModal(t as Template)} title="Trigger a demo email to test this template">
                    🚀 Demo Mail
                  </Button>
                  {manage ? (
                    <>
                      <Button variant="ghost" onClick={() => openEdit(t as Template)}>Edit</Button>
                      <Button variant="ghost" onClick={() => setDeleteTarget(t.id)}>Archive</Button>
                    </>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} title={editTarget ? "Edit template" : "New template"} onClose={() => setOpen(false)}>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit(
            (v) => save.mutate(v),
            (errors) => console.warn("Template form validation errors:", errors)
          )}
        >
          {save.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(save.error as Error).message || "Failed to save template"}
            </div>
          ) : null}

          {Object.keys(form.formState.errors).length > 0 && !save.error ? (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800 border border-amber-200">
              Please fix the required fields highlighted below before saving.
            </div>
          ) : null}

          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="e.g. IT Support Introduction" {...form.register("name")} />
          </Field>
          <Field label="Subject" error={form.formState.errors.subject?.message}>
            <Input placeholder="e.g. Enhancing IT Infrastructure for {{company}}" {...form.register("subject")} />
          </Field>
          <Field label="Plain text body" error={form.formState.errors.body_text?.message}>
            <Textarea
              rows={5}
              placeholder="Hi {{name}}, we specialize in managed IT services..."
              {...form.register("body_text")}
            />
          </Field>
          <Field label="HTML (optional, sanitized on save)" error={form.formState.errors.body_html?.message}>
            <Textarea
              rows={4}
              placeholder="<p>Hi {{name}},</p><p>We can help <strong>{{company}}</strong> scale.</p>"
              {...form.register("body_html")}
            />
          </Field>
          <Card>
            <p className="text-xs font-semibold text-slate-500 uppercase">Preview</p>
            <p className="mt-1 text-sm text-slate-700">{preview || "(Start typing above to preview variable substitution)"}</p>
          </Card>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending} className="flex-1">
              {save.isPending ? "Saving..." : editTarget ? "Update Template" : "Save Template"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const plainText = form.getValues("body_text")?.trim() || (form.getValues("body_html") ? form.getValues("body_html").replace(/<[^>]+>/g, " ").trim() : "");
                openDemoModal({
                  id: editTarget?.id || "preview",
                  name: form.getValues("name") || "Draft Template",
                  subject: form.getValues("subject") || "Preview Subject",
                  body_text: plainText,
                  body_html: form.getValues("body_html") || "",
                });
              }}
              title="Test this template with a demo email"
            >
              🚀 Test Demo
            </Button>
          </div>
        </form>
      </Modal>
      <Confirm
        open={Boolean(deleteTarget)}
        title="Archive this template?"
        body="The template will be hidden. Existing campaigns that copied its content are not affected."
        confirmLabel="Archive"
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) archive.mutate(deleteTarget); }}
      />

      {/* Demo Email Trigger Modal */}
      <Modal open={Boolean(demoTarget)} title={`Send Demo Email: ${demoTarget?.name || "Template"}`} onClose={() => setDemoTarget(null)}>
        {demoTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 leading-relaxed">
              💡 <strong>डेमो मेल चाचणी (Demo Email Test):</strong> ही चाचणी तुमच्या मेल इनबॉक्समध्ये टेम्पलेट प्रत्यक्ष कसे दिसते, व्हेरिएबल्स (उदा. नाव, कंपनी) कसे बदलतात आणि फॉरमॅटिंग बरोबर आहे का हे तपासण्यासाठी आहे.
            </div>

            {demoStatus === "sent" && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                {demoMessage}
              </div>
            )}

            {demoStatus === "error" && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                {demoMessage}
              </div>
            )}

            <Field label="Recipient Email Address (डेमो मेल कोठे पाठवायचा)">
              <Input
                type="email"
                placeholder="your-email@example.com"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
                disabled={demoStatus === "sending"}
                required
              />
            </Field>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 block">
                Sample Test Variables (नमुना व्हेरिएबल्स)
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-slate-500 block mb-1">Name ({"{{name}}"}):</label>
                  <Input
                    className="text-xs py-1"
                    value={demoVars.name}
                    onChange={(e) => setDemoVars((v) => ({ ...v, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Company ({"{{company}}"}):</label>
                  <Input
                    className="text-xs py-1"
                    value={demoVars.company}
                    onChange={(e) => setDemoVars((v) => ({ ...v, company: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Service ({"{{service}}"}):</label>
                  <Input
                    className="text-xs py-1"
                    value={demoVars.service}
                    onChange={(e) => setDemoVars((v) => ({ ...v, service: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">City ({"{{city}}"}):</label>
                  <Input
                    className="text-xs py-1"
                    value={demoVars.city}
                    onChange={(e) => setDemoVars((v) => ({ ...v, city: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Card>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block">Subject Preview</span>
                <p className="text-xs font-medium text-slate-800">
                  {personalize(demoTarget.subject || "", { ...demoVars, email: demoEmail })}
                </p>
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase block">Body Preview</span>
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap mt-1 font-sans line-clamp-6 bg-white p-2 rounded border border-slate-100">
                    {personalize(demoTarget.body_text || demoTarget.body_html || "", { ...demoVars, email: demoEmail })}
                  </pre>
                </div>
              </div>
            </Card>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                className="flex-1"
                disabled={demoStatus === "sending"}
                onClick={() => void triggerDemoEmail()}
              >
                {demoStatus === "sending" ? "Sending Demo Mail..." : "🚀 Trigger Demo Email (डेमो मेल पाठवा)"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDemoTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
