import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import DOMPurify from "dompurify";
import { campaignFormSchema, canManageCampaigns } from "@crm/shared";
import type { z } from "zod";
import { useSession } from "../lib/session";
import { invokeFunction, supabase } from "../lib/supabase";
import { downloadWorkbook } from "../lib/export";
import { Button, Card, Confirm, Empty, Field, Input, Modal, PageHeader, Select, Textarea } from "../components/ui";

type Form = z.infer<typeof campaignFormSchema>;

export function CampaignsPage() {
  const { org } = useSession();
  const manage = canManageCampaigns(org?.role);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<Form>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: { name: "", subject: "", body_text: "", requires_consent: true },
  });

  const templates = useQuery({
    queryKey: ["templates", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => (await supabase.from("email_templates").select("id, name, subject, body_text, body_html").eq("organization_id", org!.organization_id)).data ?? [],
  });
  const lists = useQuery({
    queryKey: ["lists", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => (await supabase.from("contact_lists").select("id, name").eq("organization_id", org!.organization_id)).data ?? [],
  });
  const list = useQuery({
    queryKey: ["campaigns", org?.organization_id],
    enabled: Boolean(org),
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("organization_id", org!.organization_id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      let scheduledIso: string | null = null;
      if (values.scheduled_at && values.scheduled_at.trim()) {
        const d = new Date(values.scheduled_at);
        if (!isNaN(d.getTime())) {
          scheduledIso = d.toISOString();
        }
      }
      const derivedText = values.body_text?.trim()
        ? values.body_text
        : (values.body_html ? values.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

      const { error } = await supabase.from("campaigns").insert({
        name: values.name.trim(),
        template_id: values.template_id || null,
        list_id: values.list_id || null,
        subject: values.subject.trim(),
        body_text: derivedText,
        body_html: DOMPurify.sanitize(values.body_html || ""),
        organization_id: org!.organization_id,
        scheduled_at: scheduledIso,
        requires_consent: values.requires_consent,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      await qc.refetchQueries({ queryKey: ["campaigns"] });
      setOpen(false);
      form.reset();
    },
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Queueing is confirmed server-side. Unknown/withdrawn consent is never mailed when consent is required."
        actions={
          manage ? (
            <Button
              type="button"
              onClick={() => {
                create.reset();
                form.reset({ name: "", subject: "", body_text: "", requires_consent: true });
                setOpen(true);
              }}
            >
              New campaign
            </Button>
          ) : null
        }
      />
      {!list.data?.length ? (
        <Empty title="No campaigns" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 pb-2">
                  <th className="py-2.5">Name</th>
                  <th>Status</th>
                  <th>Scheduled Send (नियोजित वेळ)</th>
                  <th>Queued</th>
                  <th>Sent</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                    <td className="py-3 font-medium">
                      <Link className="text-amber-600 hover:text-amber-700 hover:underline font-semibold" to={`/app/campaigns/${c.id}`}>
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        c.status === "scheduled" ? "bg-amber-100 text-amber-800 border border-amber-300" :
                        c.status === "sending" || c.status === "queued" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                        c.status === "completed" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="text-xs text-slate-600 font-medium">
                      {c.scheduled_at ? `📅 ${new Date(c.scheduled_at).toLocaleString()}` : "⚡ Immediate (लगेच)"}
                    </td>
                    <td>{c.queued_count}</td>
                    <td className="text-emerald-600 font-semibold">{c.sent_count}</td>
                    <td className="text-rose-600 font-semibold">{c.failed_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal open={open} title="New Campaign (नवीन मोहीम)" onClose={() => setOpen(false)}>
        <form
          className="space-y-3.5"
          onSubmit={form.handleSubmit(
            (v) => create.mutate(v),
            (errors) => console.warn("Campaign form validation errors:", errors)
          )}
        >
          {create.error ? (
            <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700 border border-rose-200">
              {(create.error as Error).message || "Failed to create campaign"}
            </div>
          ) : null}

          {Object.keys(form.formState.errors).length > 0 && !create.error ? (
            <div className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-800 border border-amber-200">
              Please fix the required fields highlighted below before saving.
            </div>
          ) : null}

          <Field label="Campaign Name" error={form.formState.errors.name?.message}>
            <Input placeholder="e.g. Diwali IT Services Offer" {...form.register("name")} />
          </Field>
          <Field label="Template (Optional)">
            <Select
              {...form.register("template_id")}
              onChange={(e) => {
                form.register("template_id").onChange(e);
                const t = templates.data?.find((x) => x.id === e.target.value);
                if (t) {
                  form.setValue("subject", t.subject);
                  form.setValue("body_text", t.body_text);
                  form.setValue("body_html", t.body_html);
                }
              }}
            >
              <option value="">None (Custom Email)</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact list (empty = all eligible contacts)">
            <Select {...form.register("list_id")}>
              <option value="">All consented contacts</option>
              {(lists.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" error={form.formState.errors.subject?.message}>
            <Input placeholder="Email Subject line" {...form.register("subject")} />
          </Field>
          <Field label="Body" error={form.formState.errors.body_text?.message}>
            <Textarea rows={5} placeholder="Compose your email message..." {...form.register("body_text")} />
          </Field>

          {/* Schedule Date & Time section */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2">
            <Field label="Schedule Delivery Date & Time (मेल कधी पाठवायचा - तारीख व वेळ)" error={form.formState.errors.scheduled_at?.message}>
              <Input type="datetime-local" {...form.register("scheduled_at")} />
            </Field>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              💡 <strong>टीप:</strong> जर तुम्हाला मेल लगेच पाठवायचा असेल तर तारीख-वेळ रिकामी ठेवा (Immediate). जर भविष्यात विशिष्ट दिवशी व वेळी आपोआप पाठवायचा असेल तर वरील तारीख व वेळ निवडा.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" {...form.register("requires_consent")} /> Require granted consent
          </label>
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? "Saving..." : "Save Campaign Draft"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export function CampaignDetailPage() {
  const { org } = useSession();
  const manage = canManageCampaigns(org?.role);
  const { id } = useParams();
  const qc = useQueryClient();
  const [confirmQueue, setConfirmQueue] = useState(false);

  const campaign = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", id!).single()).data,
  });
  const jobs = useQuery({
    queryKey: ["jobs", id],
    queryFn: async () => (await supabase.from("email_jobs").select("id, to_email, status, last_error, attempt_count, scheduled_at").eq("campaign_id", id!).limit(500)).data ?? [],
  });

  const queue = useMutation({
    mutationFn: async () => invokeFunction("queue-campaign", { campaignId: id, confirmed: true }),
    onSuccess: () => {
      setConfirmQueue(false);
      void qc.invalidateQueries({ queryKey: ["campaign", id] });
      void qc.invalidateQueries({ queryKey: ["jobs", id] });
    },
  });

  const pause = useMutation({
    mutationFn: async (status: "paused" | "cancelled") => {
      const { error: cErr } = await supabase.from("campaigns").update({ status }).eq("id", id!);
      if (cErr) throw cErr;
      if (status === "cancelled") {
        const { error: jErr } = await supabase.from("email_jobs").update({ status: "cancelled" }).eq("campaign_id", id!).in("status", ["queued", "failed"]);
        if (jErr) throw jErr;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaign", id] }),
  });

  const c = campaign.data;
  if (!c) return <Empty title="Campaign not found" />;

  return (
    <div>
      <PageHeader
        title={c.name}
        subtitle={`${c.status} · SMTP accepted is not inbox delivery`}
        actions={
          manage ? (
            <>
              {["draft", "scheduled", "paused"].includes(c.status) ? (
                <Button onClick={() => setConfirmQueue(true)}>
                  {c.scheduled_at && new Date(c.scheduled_at) > new Date() ? "Confirm & Schedule" : "Queue Send"}
                </Button>
              ) : null}
              {c.status === "sending" || c.status === "queued" ? (
                <Button variant="secondary" onClick={() => pause.mutate("paused")}>
                  Pause
                </Button>
              ) : null}
              {["queued", "sending", "paused", "scheduled"].includes(c.status) ? (
                <Button variant="danger" onClick={() => pause.mutate("cancelled")}>
                  Cancel remaining
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  const rows = (jobs.data ?? []).map((j, idx) => ({
                    "Sr No": idx + 1,
                    "Recipient Email": j.to_email || "",
                    "Delivery Status": j.status ? j.status.toUpperCase() : "",
                    "Attempts": j.attempt_count ?? 0,
                    "Error Reason": j.last_error || "None",
                    "Scheduled Date": j.scheduled_at ? new Date(j.scheduled_at).toLocaleString() : "Immediate",
                  }));
                  downloadWorkbook(`SMPatel_Campaign_${(c.name || "Campaign").replace(/\s+/g, "_")}.xlsx`, rows, "Campaign Results");
                }}
              >
                Export Results
              </Button>
            </>
          ) : null
        }
      />

      {/* Prominent Scheduling Information Banner */}
      {c.scheduled_at && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4 flex flex-wrap items-center justify-between gap-3 text-amber-950 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⏰</span>
            <div>
              <div className="font-bold text-sm">Scheduled Email Campaign (नियोजित मोहीम)</div>
              <div className="text-xs text-amber-900 mt-0.5">
                Automatically scheduled to dispatch on: <strong>{new Date(c.scheduled_at).toLocaleString()}</strong>
              </div>
            </div>
          </div>
          <span className="rounded-full bg-amber-200/90 border border-amber-300 px-3 py-1 font-bold text-amber-900 text-xs">
            {new Date(c.scheduled_at) > new Date() ? "⏳ Awaiting Scheduled Time" : "✅ Dispatched"}
          </span>
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ["Recipients", c.recipient_count],
          ["Queued", c.queued_count],
          ["SMTP accepted", c.sent_count],
          ["Failed", c.failed_count],
        ].map(([l, v]) => (
          <Card key={String(l)}>
            <p className="text-xs text-slate-500">{l}</p>
            <p className="text-xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">To</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {(jobs.data ?? []).map((j) => (
              <tr key={j.id} className="border-t">
                <td className="py-2">{j.to_email}</td>
                <td>{j.status}</td>
                <td>{j.attempt_count}</td>
                <td className="text-rose-700">{j.last_error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Confirm
        open={confirmQueue}
        title="Queue this campaign?"
        body="Jobs will be created only for contacts with granted consent (if required) and who are not suppressed. Duplicate campaign+contact jobs are ignored."
        confirmLabel="Queue"
        onClose={() => setConfirmQueue(false)}
        onConfirm={() => queue.mutate()}
      />
      {queue.error ? <p className="mt-2 text-sm text-rose-700">{(queue.error as Error).message}</p> : null}
      {pause.error ? <p className="mt-2 text-sm text-rose-700">{(pause.error as Error).message}</p> : null}
      <p className="mt-4 text-sm">
        <Link to="/app/campaigns">Back</Link>
      </p>
    </div>
  );
}
