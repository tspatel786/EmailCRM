import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import DOMPurify from "dompurify";
import { canManageCampaigns, personalize, templateFormSchema } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Textarea } from "../components/ui";

type Form = z.infer<typeof templateFormSchema>;
type Template = { id: string; name: string; subject: string; body_text: string; body_html: string };

export function TemplatesPage() {
  const { org } = useSession();
  const manage = canManageCampaigns(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(templateFormSchema), defaultValues: { name: "", subject: "", body_text: "", body_html: "" } });
  const preview = personalize(form.watch("body_text") || "", { name: "Priya", company: "Northwind", service: "Managed IT" });

  const list = useQuery({
    queryKey: ["templates", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").eq("organization_id", org!.organization_id).is("archived_at", null);
      if (error) throw error;
      return data;
    },
  });

  function openCreate() {
    setEditTarget(null);
    form.reset({ name: "", subject: "", body_text: "", body_html: "" });
    setOpen(true);
  }

  function openEdit(t: Template) {
    setEditTarget(t);
    form.reset({ name: t.name, subject: t.subject, body_text: t.body_text, body_html: t.body_html });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async (values: Form) => {
      const payload = { ...values, body_html: DOMPurify.sanitize(values.body_html || "") };
      if (editTarget) {
        const { error } = await supabase.from("email_templates").update(payload).eq("id", editTarget.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert({ ...payload, organization_id: org!.organization_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["templates"] });
      setOpen(false);
      setEditTarget(null);
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").update({ archived_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["templates"] });
      setDeleteTarget(null);
    },
  });

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Variables: {{name}}, {{company}}, {{service}}, {{email}}, {{phone}}, {{city}}"
        actions={manage ? <Button onClick={openCreate}>New template</Button> : null}
      />
      {!list.data?.length ? (
        <Empty title="No templates" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium">{t.name}</h3>
                  <p className="text-sm text-slate-500">{t.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-600 line-clamp-4">{t.body_text}</pre>
                </div>
                {manage ? (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" onClick={() => openEdit(t as Template)}>Edit</Button>
                    <Button variant="ghost" onClick={() => setDeleteTarget(t.id)}>Archive</Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} title={editTarget ? "Edit template" : "New template"} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <Field label="Name">
            <Input {...form.register("name")} />
          </Field>
          <Field label="Subject">
            <Input {...form.register("subject")} />
          </Field>
          <Field label="Plain text">
            <Textarea rows={6} {...form.register("body_text")} />
          </Field>
          <Field label="HTML (sanitized on save)">
            <Textarea rows={6} {...form.register("body_html")} />
          </Field>
          <Card>
            <p className="text-xs text-slate-500">Preview</p>
            <p className="text-sm">{preview}</p>
          </Card>
          {save.error ? <p className="text-sm text-rose-700">{(save.error as Error).message}</p> : null}
          <Button type="submit" disabled={save.isPending}>Save</Button>
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
    </div>
  );
}
