import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { canAdmin, canWrite } from "@crm/shared";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { WhatsAppButton } from "../components/WhatsAppButton";
import { fmtDateTime, telHref } from "../lib/format";
import { Badge, Button, Card, Confirm, Empty, Field, Input, PageHeader, Select, Spinner, TableSkeleton, TableWrap, Textarea } from "../components/ui";
import { MemberSelect } from "./Companies";

const tabs = [
  "Overview",
  "Details",
  "Calls",
  "Emails",
  "Follow-ups",
  "Tasks",
  "Meetings",
  "Notes",
  "Quotations",
  "Projects",
  "Attachments",
  "Timeline",
] as const;

export function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const isAdmin = canAdmin(org?.role);
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [note, setNote] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [detailDraft, setDetailDraft] = useState<Record<string, string>>({});

  const contact = useQuery({
    queryKey: ["contact", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const timeline = useQuery({
    queryKey: ["timeline", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, profiles:actor_user_id(full_name)")
        .eq("contact_id", id!)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const related = useQuery({
    queryKey: ["contact-related", id],
    enabled: Boolean(id && org),
    queryFn: async () => {
      const [calls, jobs, tasks, meetings, quotes, projects, docs] = await Promise.all([
        supabase.from("calls").select("*").eq("contact_id", id!).order("called_at", { ascending: false }),
        supabase.from("email_jobs").select("*").eq("contact_id", id!).order("created_at", { ascending: false }).limit(50),
        supabase.from("tasks").select("*").eq("contact_id", id!).order("due_at", { ascending: false }),
        supabase.from("meetings").select("*").eq("contact_id", id!).order("starts_at", { ascending: false }),
        supabase.from("quotations").select("*").eq("contact_id", id!).order("created_at", { ascending: false }),
        supabase.from("projects").select("*").eq("contact_id", id!).order("created_at", { ascending: false }),
        supabase.from("documents").select("*").eq("contact_id", id!).order("created_at", { ascending: false }),
      ]);
      return {
        calls: calls.data ?? [],
        jobs: jobs.data ?? [],
        tasks: tasks.data ?? [],
        meetings: meetings.data ?? [],
        quotes: quotes.data ?? [],
        projects: projects.data ?? [],
        docs: docs.data ?? [],
      };
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("record_activity", {
        p_org: org!.organization_id,
        p_contact: id,
        p_company: contact.data?.company_id,
        p_type: "note",
        p_summary: note,
        p_outcome: null,
        p_source_table: "contacts",
        p_source_id: id,
        p_next_follow_up: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["timeline", id] });
    },
    onError: (err) => {
      console.error("Add note failed:", err);
    },
  });

  const convert = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contacts")
        .update({ lifecycle: "customer", lead_status: "won" })
        .eq("id", id!);
      if (error) throw error;
      await supabase.rpc("record_activity", {
        p_org: org!.organization_id,
        p_contact: id,
        p_company: contact.data?.company_id,
        p_type: "status_change",
        p_summary: "Converted lead to customer. History remains linked.",
        p_outcome: "converted",
        p_source_table: "contacts",
        p_source_id: id,
        p_next_follow_up: null,
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contact", id] }),
  });

  const saveDetails = useMutation({
    mutationFn: async () => {
      const current = contact.data;
      if (!current) throw new Error("Missing contact");
      const merged = { ...current, ...detailDraft };
      const { error } = await supabase
        .from("contacts")
        .update({
          full_name: merged.full_name,
          company_name: merged.company_name || null,
          primary_email: merged.primary_email || null,
          primary_phone: merged.primary_phone || null,
          website: merged.website || null,
          city: merged.city || null,
          state: merged.state || null,
          country: merged.country || null,
          service_interest: merged.service_interest || null,
          lead_source: merged.lead_source || null,
          lead_status: merged.lead_status,
          priority: merged.priority,
          consent_status: merged.consent_status,
          notes: merged.notes || null,
        })
        .eq("id", id!);
      if (error) throw error;
      await supabase.rpc("record_activity", {
        p_org: org!.organization_id,
        p_contact: id,
        p_company: contact.data?.company_id,
        p_type: "status_change",
        p_summary: "Updated contact details",
        p_outcome: null,
        p_source_table: "contacts",
        p_source_id: id,
        p_next_follow_up: null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", id] });
      await qc.refetchQueries({ queryKey: ["contact", id] });
      await qc.invalidateQueries({ queryKey: ["timeline", id] });
      await qc.refetchQueries({ queryKey: ["timeline", id] });
      await qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const reassign = useMutation({
    mutationFn: async (ownerUserId: string | null) => {
      const { error } = await supabase.from("contacts").update({ owner_user_id: ownerUserId }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", id] });
      await qc.refetchQueries({ queryKey: ["contact", id] });
    },
  });

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 20 * 1024 * 1024) throw new Error("File exceeds 20 MB");
      const docId = crypto.randomUUID();
      const path = `${org!.organization_id}/${docId}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("org-documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("documents").insert({
        organization_id: org!.organization_id,
        contact_id: id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        byte_size: file.size,
        uploaded_by: user!.id,
        owner_user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["contact-related", id] }),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contacts").update({ archived_at: new Date().toISOString(), lifecycle: "archived" }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: async () => {
      setConfirmArchive(false);
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      navigate("/app/contacts");
    },
  });

  if (contact.isLoading) return <Spinner />;
  if (!contact.data) return <Empty title="Contact not found" />;
  const c = contact.data;
  const draft = {
    full_name: c.full_name,
    company_name: c.company_name ?? "",
    primary_email: c.primary_email ?? "",
    primary_phone: c.primary_phone ?? "",
    website: c.website ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    country: c.country ?? "",
    service_interest: c.service_interest ?? "",
    lead_source: c.lead_source ?? "",
    lead_status: c.lead_status,
    priority: c.priority,
    consent_status: c.consent_status,
    notes: c.notes ?? "",
    ...detailDraft,
  };
  const rel = related.data;

  return (
    <div>
      <PageHeader
        title={c.full_name}
        subtitle={`${c.company_name || "No company"} · ${c.lifecycle} · ${c.lead_status}`}
        actions={
          writable ? (
            <>
              {c.lifecycle === "lead" ? (
                <Button variant="secondary" onClick={() => convert.mutate()}>
                  Convert to customer
                </Button>
              ) : null}
              <Button variant="danger" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            </>
          ) : null
        }
      />
      <div className="-mx-4 mb-5 overflow-x-auto border-b border-ink-200 px-4 dark:border-ink-800 sm:mx-0 sm:px-0" role="tablist" aria-label="Contact sections">
        <div className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`relative min-h-11 whitespace-nowrap px-3.5 text-sm font-medium transition-colors ${
                tab === t ? "text-ink-900 dark:text-white" : "text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
              }`}
              onClick={() => setTab(t)}
            >
              {t}
              {tab === t ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-500" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </div>

      {tab === "Overview" || tab === "Timeline" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1 space-y-2 text-sm">
            <p>
              Email: {c.primary_email || "—"} · Consent <Badge>{c.consent_status}</Badge>
            </p>
            <p>
              Phone:{" "}
              {telHref(c.primary_phone) ? (
                <a className="font-medium text-primary-700 hover:underline" href={telHref(c.primary_phone)!}>
                  {c.primary_phone}
                </a>
              ) : (
                "—"
              )}
            </p>
            <WhatsAppButton variant="button" contactId={c.id} phone={c.primary_phone} context={{ name: c.full_name, company: c.company_name }} />
            <p className="text-xs text-slate-500 dark:text-ink-400">
              Click-to-call opens the device dialer. It does not log duration or record the conversation. Log the call manually after you hang up.
            </p>
            <p>
              Location: {[c.city, c.state, c.country].filter(Boolean).join(", ") || "—"}
            </p>
            <p>Service: {c.service_interest || "—"}</p>
            <p>Source: {c.lead_source || "—"}</p>
            <p>Priority: {c.priority}</p>
            <p className="whitespace-pre-wrap">{c.notes}</p>
          </Card>
          <Card className="lg:col-span-2">
            <h2 className="mb-3 font-medium">Activity timeline</h2>
            {!timeline.data?.length ? (
              <Empty title="No activity yet" />
            ) : (
              <ol className="space-y-3">
                {timeline.data.map((a) => (
                  <li key={a.id} className="border-l-2 border-primary-400 pl-3 text-sm">
                    <div className="flex flex-wrap gap-2 text-slate-500 dark:text-ink-400">
                      <Badge tone="teal">{a.activity_type}</Badge>
                      <span>{fmtDateTime(a.occurred_at)}</span>
                      <span>{(a.profiles as { full_name?: string } | null)?.full_name || user?.email}</span>
                    </div>
                    <p className="mt-1">{a.summary}</p>
                    {a.outcome ? <p className="text-slate-500 dark:text-ink-400">Outcome: {a.outcome}</p> : null}
                    {a.next_follow_up_at ? <p>Next follow-up: {fmtDateTime(a.next_follow_up_at)}</p> : null}
                    {a.source_table ? (
                      <p className="text-xs text-slate-400 dark:text-ink-500">
                        Linked {a.source_table} {a.source_id}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "Details" ? (
        <Card className="grid max-w-3xl gap-3 sm:grid-cols-2">
          {(
            [
              ["full_name", "Full name"],
              ["company_name", "Company"],
              ["primary_email", "Email"],
              ["primary_phone", "Phone"],
              ["website", "Website"],
              ["city", "City"],
              ["state", "State"],
              ["country", "Country"],
              ["service_interest", "IT service interest"],
              ["lead_source", "Lead source"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                value={draft[key]}
                disabled={!writable}
                onChange={(e) => setDetailDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label="Status">
            <Select value={draft.lead_status} disabled={!writable} onChange={(e) => setDetailDraft((d) => ({ ...d, lead_status: e.target.value }))}>
              {["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={draft.priority} disabled={!writable} onChange={(e) => setDetailDraft((d) => ({ ...d, priority: e.target.value }))}>
              {["low", "medium", "high", "urgent"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Consent">
            <Select value={draft.consent_status} disabled={!writable} onChange={(e) => setDetailDraft((d) => ({ ...d, consent_status: e.target.value }))}>
              {["unknown", "granted", "withdrawn"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea value={draft.notes} disabled={!writable} onChange={(e) => setDetailDraft((d) => ({ ...d, notes: e.target.value }))} />
            </Field>
          </div>
          {isAdmin ? (
            <Field label="Owner (reassign)">
              <MemberSelect value={c.owner_user_id} onChange={(v) => reassign.mutate(v)} />
            </Field>
          ) : null}
          {writable ? (
            <Button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending}>
              {saveDetails.isPending ? "Saving details..." : "Save details"}
            </Button>
          ) : null}
          {saveDetails.error ? <p className="text-sm text-rose-700">{(saveDetails.error as Error).message}</p> : null}
        </Card>
      ) : null}

      {tab === "Notes" && writable ? (
        <Card className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" />
          {addNote.error ? (
            <div className="rounded-lg bg-rose-50 p-2 text-xs font-medium text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30">
              {(addNote.error as Error).message || "Failed to save note"}
            </div>
          ) : null}
          <Button type="button" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
            {addNote.isPending ? "Saving..." : "Save note"}
          </Button>
        </Card>
      ) : null}

      {tab === "Calls" ? <RelatedTable rows={rel?.calls ?? []} cols={["called_at", "direction", "outcome", "notes"]} loading={related.isLoading} /> : null}
      {tab === "Emails" ? <RelatedTable rows={rel?.jobs ?? []} cols={["created_at", "subject", "status", "to_email"]} loading={related.isLoading} /> : null}
      {tab === "Follow-ups" || tab === "Tasks" ? <RelatedTable rows={rel?.tasks ?? []} cols={["title", "due_at", "status", "kind"]} loading={related.isLoading} /> : null}
      {tab === "Meetings" ? <RelatedTable rows={rel?.meetings ?? []} cols={["title", "starts_at", "status"]} loading={related.isLoading} /> : null}
      {tab === "Quotations" ? <RelatedTable rows={rel?.quotes ?? []} cols={["title", "status", "total_amount"]} loading={related.isLoading} /> : null}
      {tab === "Projects" ? <RelatedTable rows={rel?.projects ?? []} cols={["name", "status", "deadline"]} loading={related.isLoading} /> : null}
      {tab === "Attachments" ? (
        <div className="space-y-3">
          {writable ? (
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadDoc.mutateAsync(f).catch((err: Error) => alert(err.message));
              }}
            />
          ) : null}
          {related.isLoading ? (
            <Card>
              <TableSkeleton rows={4} />
            </Card>
          ) : rel?.docs.length ? (
            <RelatedTable rows={rel.docs} cols={["file_name", "mime_type", "created_at"]} />
          ) : (
            <Empty title="No attachments" hint="PDF, Office, CSV, and images up to 20 MB." />
          )}
        </div>
      ) : null}

      <Confirm
        open={confirmArchive}
        title="Archive contact?"
        body="The record is hidden from default lists. Communication history is retained."
        confirmLabel="Archive"
        loading={archive.isPending}
        error={(archive.error as Error)?.message}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => archive.mutate()}
      />
      <p className="mt-6 text-sm">
        <Link className="font-medium text-primary-700 hover:underline" to="/app/contacts">
          Back to contacts
        </Link>
      </p>
    </div>
  );
}

function RelatedTable({ rows, cols, loading }: { rows: Array<Record<string, unknown>>; cols: string[]; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <TableSkeleton rows={4} />
      </Card>
    );
  }
  if (!rows.length) return <Empty title="No records" />;
  return (
    <Card>
      <TableWrap>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              {cols.map((c) => (
                <th key={c} className="py-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.id ?? i)} className="border-t">
                {cols.map((c) => (
                  <td key={c} className="py-2">
                    {String(r[c] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
