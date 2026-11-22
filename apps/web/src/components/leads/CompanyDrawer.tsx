import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DM_ROLES, ROLE_LABELS, canWrite, manualSearchLinks, matchRoles, type Role } from "@crm/shared";
import { ExternalLink, Globe, History, Linkedin, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useSession } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { fmtDate, fmtDateTime, telHref } from "../../lib/format";
import { saveLeadToCrm, type LeadCompany } from "../../lib/leadCrm";
import { Badge, Button, ErrorBox, Field, Input, Modal, Select, TableSkeleton, type BadgeTone } from "../ui";

type Person = {
  id: string;
  full_name: string;
  original_designation: string | null;
  roles: Role[];
  linkedin_url: string | null;
  source_type: string;
  source_url: string | null;
  verification_status: string;
  confidence_score: number;
  score_reasons: { label: string; points: number }[];
  last_verified_at: string | null;
  crm_contact_id: string | null;
  created_at: string;
};
type ContactRow = {
  id: string;
  decision_maker_id: string | null;
  contact_type: "email" | "phone";
  contact_value: string;
  contact_kind: string;
  source_url: string | null;
  verification_status: string;
  discovered_at: string;
};

const KIND_LABEL: Record<string, string> = {
  person_professional: "Personal professional",
  company_general: "Company general",
  company_switchboard: "Company switchboard",
  department: "Department",
};
const VERIFY_TONE: Record<string, BadgeTone> = { source_confirmed: "green", website_confirmed: "green", manually_verified: "blue", publicly_listed: "teal", unverified: "slate" };

function errText(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
}

export function CompanyDrawer({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const { org, user } = useSession();
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "people" | "history">("overview");
  const [editPerson, setEditPerson] = useState<Person | "new" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [website, setWebsite] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["lead-company", companyId],
    queryFn: async () => {
      const [c, people, contacts] = await Promise.all([
        supabase.from("discovered_companies").select("*").eq("id", companyId).single(),
        supabase.from("decision_makers").select("*").eq("company_id", companyId).order("confidence_score", { ascending: false }),
        supabase.from("lead_contacts").select("*").eq("company_id", companyId).order("contact_type"),
      ]);
      if (c.error) throw c.error;
      return { c: c.data as LeadCompany & Record<string, unknown>, people: (people.data ?? []) as Person[], contacts: (contacts.data ?? []) as ContactRow[] };
    },
  });
  const history = useQuery({
    queryKey: ["lead-history", companyId],
    enabled: tab === "history",
    queryFn: async () => {
      const ids = [companyId, ...(q.data?.people.map((p) => p.id) ?? []), ...(q.data?.contacts.map((x) => x.id) ?? [])];
      const { data, error } = await supabase.from("lead_field_history").select("*").in("record_id", ids).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reload = () => {
    qc.invalidateQueries({ queryKey: ["lead-company", companyId] });
    qc.invalidateQueries({ queryKey: ["lead-history", companyId] });
    qc.invalidateQueries({ queryKey: ["decision-makers"] });
  };

  const patch = useMutation({
    mutationFn: async (p: Record<string, unknown>) => {
      const { error } = await supabase.from("discovered_companies").update(p).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => { reload(); setWebsite(null); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });

  const save = useMutation({
    mutationFn: async ({ person, pipeline }: { person: Person | null; pipeline: boolean }) =>
      saveLeadToCrm({ company: q.data!.c, person, addToPipeline: pipeline, userId: user!.id }),
    onSuccess: (r) => { setMsg({ ok: true, text: `Saved to CRM${r.dealId ? " and added to the pipeline" : ""}.${r.reused.length ? ` Reused existing ${r.reused.join(" and ")} (no duplicate created).` : ""}` }); reload(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });

  const removePerson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("decision_makers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: reload,
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const removeContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: reload,
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });

  const c = q.data?.c;
  const links = c ? manualSearchLinks(c.company_name, c.cin, c.website) : null;
  const companyContacts = (q.data?.contacts ?? []).filter((x) => !x.decision_maker_id);

  return (
    <Modal size="xl" open title={c ? c.company_name : "Company"} onClose={onClose}>
      {q.isLoading ? <TableSkeleton rows={6} /> : q.error ? <ErrorBox message={errText(q.error)} /> : c ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 border-b border-ink-100 dark:border-ink-800">
            {([["overview", "Overview"], ["people", `Decision makers (${q.data!.people.length})`], ["history", "History"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-primary-500 text-primary-700 dark:text-primary-300" : "border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"}`}>{l}</button>
            ))}
          </div>
          {msg ? <div className={`rounded-control border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>{msg.text}</div> : null}

          {tab === "overview" ? (
            <div className="space-y-4">
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {([
                  ["CIN", c.cin], ["Registered", fmtDate(c.registration_date as string | null)], ["Status", c.company_status as string], ["Class / category", [c.company_class, c.company_category].filter(Boolean).join(" · ")],
                  ["State", c.state], ["City", c.city], ["Industry", c.industry], ["NIC code", c.nic_code as string], ["Business activity", c.business_activity as string],
                  ["Paid-up capital", c.paid_up_capital ? `₹${Number(c.paid_up_capital).toLocaleString("en-IN")}` : null], ["Registered office", c.registered_address as string],
                  ["Source", `${c.source_key} · imported ${fmtDateTime(c.first_imported_at as string)}`],
                ] as [string, string | null | undefined][]).map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-2xs font-semibold uppercase tracking-wide text-ink-500">{k}</dt><dd className="break-words text-ink-800 dark:text-ink-200">{v || "Not available"}</dd></div>
                ))}
              </dl>

              <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                <p className="mb-1 text-sm font-semibold">Lead score: {c.lead_score as number}/100</p>
                <ul className="text-sm text-ink-600 dark:text-ink-300">
                  {((c.score_reasons as { label: string; points: number }[]) ?? []).map((r) => <li key={r.label}>+{r.points} {r.label}</li>)}
                  {!(c.score_reasons as unknown[])?.length ? <li>No scoring signals yet.</li> : null}
                </ul>
                {c.opportunities.length ? <p className="mt-2 text-sm"><b>Suggested opportunities</b> (not confirmed requirements): {c.opportunities.join(", ")}</p> : null}
              </div>

              <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Globe size={15} /> Website</p>
                {website !== null ? (
                  <div className="flex flex-wrap gap-2">
                    <Input value={website} placeholder="https://company.com" onChange={(e) => setWebsite(e.target.value)} className="min-w-[220px] flex-1" />
                    <Button size="sm" onClick={() => {
                      const v = website.trim();
                      if (v && !/^https?:\/\/[^\s/]+\.[^\s]{2,}/i.test(v)) return setMsg({ ok: false, text: "Enter a full address starting with https://" });
                      patch.mutate({ website: v || null, website_status: v ? "confirmed" : "none" });
                    }}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setWebsite(null)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {c.website && c.website_status !== "rejected" ? (
                      <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline dark:text-primary-300">{c.website}</a>
                    ) : <span className="text-ink-500">Not available</span>}
                    {c.website ? <Badge tone={c.website_status === "confirmed" ? "green" : c.website_status === "rejected" ? "rose" : "amber"}>{c.website_status === "suggested" ? "auto-matched, please confirm" : c.website_status}</Badge> : null}
                    {writable ? (
                      <>
                        {c.website && c.website_status === "suggested" ? <Button size="sm" variant="secondary" onClick={() => patch.mutate({ website_status: "confirmed" })}>Confirm</Button> : null}
                        {c.website && c.website_status !== "rejected" ? <Button size="sm" variant="ghost" onClick={() => patch.mutate({ website_status: "rejected" })}>Not this company</Button> : null}
                        <Button size="sm" variant="ghost" onClick={() => setWebsite(c.website ?? "")}><Pencil size={13} /> {c.website ? "Edit" : "Add website"}</Button>
                      </>
                    ) : null}
                  </div>
                )}
                <p className="mt-2 text-xs text-ink-500">
                  Contact discovery: <b>{String(c.discovery_status).replace(/_/g, " ")}</b>
                  {c.discovered_at ? ` · last checked ${fmtDateTime(c.discovered_at as string)}` : ""}
                  {c.discovery_error ? ` · ${c.discovery_error as string}` : ""}
                </p>
                {writable ? (
                  <Button size="sm" variant="secondary" className="mt-2" disabled={c.discovery_status === "queued" || c.discovery_status === "running"}
                    onClick={() => patch.mutate({ discovery_status: "queued", discovery_requested_at: new Date().toISOString() })}>
                    <Search size={13} /> {c.discovery_status === "queued" || c.discovery_status === "running" ? "Queued…" : "Discover contacts from website"}
                  </Button>
                ) : null}
              </div>

              <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                <p className="mb-2 text-sm font-semibold">Company contacts</p>
                {!companyContacts.length ? <p className="text-sm text-ink-500">Not available. Only contacts published on the company's own website are collected.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {companyContacts.map((x) => <ContactLine key={x.id} x={x} canDelete={writable} onDelete={() => removeContact.mutate(x.id)} />)}
                  </ul>
                )}
              </div>

              {links ? (
                <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                  <p className="mb-2 text-sm font-semibold">Manual research (automated access not permitted)</p>
                  <div className="flex flex-wrap gap-2">
                    <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800" href={links.mca} target="_blank" rel="noopener noreferrer" title={links.mcaHint}><ExternalLink size={14} /> Search on MCA</a>
                    <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800" href={links.linkedinCompany} target="_blank" rel="noopener noreferrer"><Linkedin size={14} /> LinkedIn company</a>
                    <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800" href={links.linkedinPeople} target="_blank" rel="noopener noreferrer"><Linkedin size={14} /> LinkedIn people</a>
                    <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800" href={links.webSearch} target="_blank" rel="noopener noreferrer"><Search size={14} /> Find website</a>
                  </div>
                  <p className="mt-2 text-xs text-ink-500">{links.mcaHint}. Add what you find in the Decision makers tab with its source URL.</p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
                <Badge tone={c.crm_status === "in_pipeline" ? "green" : c.crm_status === "saved" ? "blue" : "slate"}>{c.crm_status === "in_pipeline" ? "In pipeline" : c.crm_status === "saved" ? "Saved in CRM" : "Not in CRM"}</Badge>
                {c.crm_contact_id ? <Link to={`/app/contacts/${c.crm_contact_id}`} className="text-sm text-primary-700 hover:underline dark:text-primary-300">Open CRM contact</Link> : null}
                {writable ? (
                  <div className="ml-auto flex gap-2">
                    {c.crm_status === "new" ? <Button variant="secondary" onClick={() => save.mutate({ person: null, pipeline: false })} disabled={save.isPending}>Save to CRM</Button> : null}
                    {c.crm_status !== "in_pipeline" ? <Button onClick={() => save.mutate({ person: null, pipeline: true })} disabled={save.isPending}>{c.crm_status === "new" ? "Save + add to pipeline" : "Add to pipeline"}</Button> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : tab === "people" ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-500">Only people explicitly published with their designation are listed. A director is never assumed to be the CEO. Phones shown under a person are only those published next to them.</p>
              {writable ? <Button size="sm" onClick={() => setEditPerson("new")}><Plus size={14} /> Add decision maker</Button> : null}
              {!q.data!.people.length ? <p className="text-sm text-ink-500">No decision makers found. Use the manual research links on the Overview tab.</p> : (
                <ul className="space-y-3">
                  {q.data!.people.map((p) => {
                    const pc = q.data!.contacts.filter((x) => x.decision_maker_id === p.id);
                    const plinks = manualSearchLinks(c.company_name, c.cin, c.website, p.full_name);
                    return (
                      <li key={p.id} className="rounded-lg border border-ink-200 p-3 dark:border-ink-700">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{p.full_name}</p>
                            <p className="text-sm text-ink-600 dark:text-ink-300">{p.original_designation ?? "Designation not published"}</p>
                            <div className="mt-1 flex flex-wrap gap-1">{p.roles.map((r) => <Badge key={r} tone="violet">{ROLE_LABELS[r]}</Badge>)}</div>
                          </div>
                          <div className="text-right text-xs">
                            <Badge tone={p.confidence_score >= 80 ? "green" : p.confidence_score >= 50 ? "amber" : "slate"}>Confidence {p.confidence_score}</Badge>
                            <p className="mt-1"><Badge tone={VERIFY_TONE[p.verification_status] ?? "slate"}>{p.verification_status.replace(/_/g, " ")}</Badge></p>
                          </div>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm">
                          {pc.map((x) => <ContactLine key={x.id} x={x} canDelete={writable} onDelete={() => removeContact.mutate(x.id)} />)}
                          {!pc.length ? <li className="text-ink-500">Professional email / phone: Not available</li> : null}
                        </ul>
                        <p className="mt-2 text-xs text-ink-500">
                          Source: {p.source_url ? <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline dark:text-primary-300">{p.source_url}</a> : p.source_type}
                          {p.last_verified_at ? ` · checked ${fmtDate(p.last_verified_at)}` : ""}
                          {p.score_reasons?.length ? ` · ${p.score_reasons.map((r) => r.label).join("; ")}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.linkedin_url ? <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline dark:text-primary-300"><Linkedin size={13} /> Profile</a>
                            : <a href={plinks.linkedinPeople} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-ink-600 hover:underline dark:text-ink-300"><Linkedin size={13} /> Search LinkedIn</a>}
                          {writable ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setEditPerson(p)}><Pencil size={13} /> Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete ${p.full_name}?`)) removePerson.mutate(p.id); }}><Trash2 size={13} /> Delete</Button>
                              {p.crm_contact_id ? <Link to={`/app/contacts/${p.crm_contact_id}`} className="self-center text-sm text-primary-700 hover:underline dark:text-primary-300">CRM contact</Link>
                                : <Button size="sm" variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ person: p, pipeline: false })}>Save person to CRM</Button>}
                            </>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div>
              {history.isLoading ? <TableSkeleton rows={4} /> : !history.data?.length ? <p className="text-sm text-ink-500">No changes recorded yet.</p> : (
                <ul className="space-y-2 text-sm">
                  {history.data.map((h) => (
                    <li key={h.id} className="rounded-lg border border-ink-200 p-2.5 dark:border-ink-700">
                      <p className="flex items-center gap-2 text-xs text-ink-500"><History size={12} /> {fmtDateTime(h.created_at)} · {h.table_name.replace(/_/g, " ")} · {h.action}{h.actor_user_id ? "" : " · automatic"}</p>
                      {h.action === "update" ? (
                        <ul className="mt-1">{Object.entries(h.changes as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => <li key={k}><span className="text-ink-500">{k}:</span> {JSON.stringify(v.from)} → <b>{JSON.stringify(v.to)}</b></li>)}</ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : null}
      {editPerson && c ? <PersonForm companyId={companyId} orgId={c.organization_id} person={editPerson === "new" ? null : editPerson} onClose={() => setEditPerson(null)} onSaved={() => { setEditPerson(null); reload(); }} /> : null}
    </Modal>
  );
}

function ContactLine({ x, canDelete, onDelete }: { x: ContactRow; canDelete: boolean; onDelete: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      {x.contact_type === "email" ? <Mail size={14} className="text-ink-400" /> : <Phone size={14} className="text-ink-400" />}
      {x.contact_type === "email" ? <a href={`mailto:${x.contact_value}`} className="font-medium text-primary-700 hover:underline dark:text-primary-300">{x.contact_value}</a>
        : <a href={telHref(x.contact_value) ?? undefined} className="font-medium text-primary-700 hover:underline dark:text-primary-300">{x.contact_value}</a>}
      <Badge tone="slate">{KIND_LABEL[x.contact_kind] ?? x.contact_kind}</Badge>
      <Badge tone={VERIFY_TONE[x.verification_status] ?? "slate"}>{x.verification_status.replace(/_/g, " ")}</Badge>
      {x.source_url ? <a href={x.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-500 hover:underline">source</a> : null}
      {canDelete ? <button type="button" aria-label="Delete contact" onClick={() => { if (window.confirm(`Delete ${x.contact_value}?`)) onDelete(); }} className="rounded p-1 text-ink-400 hover:text-rose-600"><Trash2 size={13} /></button> : null}
    </li>
  );
}

function PersonForm({ companyId, orgId, person, onClose, onSaved }: { companyId: string; orgId: string; person: Person | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useSession();
  const [name, setName] = useState(person?.full_name ?? "");
  const [designation, setDesignation] = useState(person?.original_designation ?? "");
  const [extraRole, setExtraRole] = useState<Role | "">("");
  const [linkedin, setLinkedin] = useState(person?.linkedin_url ?? "");
  const [source, setSource] = useState(person?.source_url ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (name.trim().length < 2) return setError("Enter the person's full name.");
    if (!/^https?:\/\/\S+\.\S+/i.test(source.trim())) return setError("Enter the source URL where this information is published (required for every record).");
    if (linkedin.trim() && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(linkedin.trim())) return setError("LinkedIn URL must start with https://www.linkedin.com/");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Enter a valid email, or leave it empty.");
    const digits = phone.replace(/[^\d+]/g, "");
    if (phone.trim() && !/^\+?\d{10,13}$/.test(digits)) return setError("Enter a valid phone number, or leave it empty.");
    const roles = [...new Set([...matchRoles(designation), ...(extraRole ? [extraRole] : [])])];
    setBusy(true);
    try {
      const values = {
        full_name: name.trim(), original_designation: designation.trim() || null, roles, linkedin_url: linkedin.trim() || null,
        source_url: source.trim(), verification_status: "manually_verified", last_verified_at: new Date().toISOString(),
        confidence_score: Math.min(100, 25 + (designation.trim() ? 25 : 0) + (email.trim() ? 20 : 0) + (phone.trim() ? 15 : 0) + (linkedin.trim() ? 10 : 0)),
        score_reasons: [{ label: "Entered manually with a source URL", points: 25 }, ...(designation.trim() ? [{ label: "Designation recorded", points: 25 }] : [])],
      };
      let id = person?.id;
      if (person) {
        const { error: e } = await supabase.from("decision_makers").update(values).eq("id", person.id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from("decision_makers").insert({ ...values, organization_id: orgId, company_id: companyId, source_type: "manual", created_by: user!.id }).select("id").single();
        if (e) throw /decision_makers_identity_uidx/.test(e.message) ? new Error("This person with this designation is already listed for the company.") : e;
        id = data.id;
      }
      for (const [type, value] of [["email", email.trim().toLowerCase()], ["phone", digits ? (digits.startsWith("+") ? digits : `+91${digits.replace(/^0/, "")}`) : ""]] as const) {
        if (!value) continue;
        const { error: e } = await supabase.from("lead_contacts").insert({
          organization_id: orgId, company_id: companyId, decision_maker_id: id, contact_type: type, contact_value: value,
          contact_kind: "person_professional", source_url: source.trim(), verification_status: "manually_verified", confidence_score: 70, created_by: user!.id,
        });
        if (e && e.code !== "23505") throw e;
      }
      onSaved();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal size="md" open title={person ? `Edit ${person.full_name}` : "Add decision maker"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Designation as published" hint={designation ? `Matched roles: ${matchRoles(designation).map((r) => ROLE_LABELS[r]).join(", ") || "none"}` : "e.g. Managing Director, Head of IT"}>
          <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
        </Field>
        <Field label="Additional verified role (optional)">
          <Select value={extraRole} onChange={(e) => setExtraRole(e.target.value as Role | "")}><option value="">None</option>{DM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</Select>
        </Field>
        <Field label="Source URL" required hint="Where this is publicly published (company website page, MCA page, LinkedIn profile)."><Input value={source} placeholder="https://…" onChange={(e) => setSource(e.target.value)} /></Field>
        <Field label="LinkedIn profile URL"><Input value={linkedin} placeholder="https://www.linkedin.com/in/…" onChange={(e) => setLinkedin(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Published professional email" hint="Only if published at the source. Never guess."><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Published business phone" hint="Not a private mobile."><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        {error ? <ErrorBox message={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}
