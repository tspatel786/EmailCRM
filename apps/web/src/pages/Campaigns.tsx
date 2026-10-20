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
      const { error } = await supabase.from("campaigns").insert({
        ...values,
        body_html: DOMPurify.sanitize(values.body_html || ""),
        organization_id: org!.organization_id,
        scheduled_at: values.scheduled_at ? new Date(values.scheduled_at).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      setOpen(false);
    },
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Queueing is confirmed server-side. Unknown/withdrawn consent is never mailed when consent is required."
        actions={manage ? <Button onClick={() => setOpen(true)}>New campaign</Button> : null}
      />
      {!list.data?.length ? (
        <Empty title="No campaigns" />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Name</th>
                <th>Status</th>
                <th>Queued</th>
                <th>SMTP accepted</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    <Link className="text-brand-800 hover:underline" to={`/app/campaigns/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.status}</td>
                  <td>{c.queued_count}</td>
                  <td>{c.sent_count}</td>
                  <td>{c.failed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={open} title="New campaign" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <Field label="Name">
            <Input {...form.register("name")} />
          </Field>
          <Field label="Template">
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
              <option value="">None</option>
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
          <Field label="Subject">
            <Input {...form.register("subject")} />
          </Field>
          <Field label="Body">
            <Textarea rows={6} {...form.register("body_text")} />
          </Field>
          <Field label="Schedule (optional, org timezone interpretation is UTC storage)">
            <Input type="datetime-local" {...form.register("scheduled_at")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register("requires_consent")} /> Require granted consent
          </label>
          <Button type="submit">Save draft</Button>
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
      await supabase.from("campaigns").update({ status }).eq("id", id!);
      if (status === "cancelled") {
        await supabase.from("email_jobs").update({ status: "cancelled" }).eq("campaign_id", id!).in("status", ["queued", "failed"]);
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
              {["draft", "scheduled", "paused"].includes(c.status) ? <Button onClick={() => setConfirmQueue(true)}>Queue send</Button> : null}
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
                  downloadWorkbook(`SMPatel_Campaign_${c.title.replace(/\s+/g, "_")}.xlsx`, rows, "Campaign Results");
                }}
              >
                Export Results
              </Button>
            </>
          ) : null
        }
      />
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
      <p className="mt-4 text-sm">
        <Link to="/app/campaigns">Back</Link>
      </p>
    </div>
  );
}
