import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { INDUSTRIES, websiteFromEmail, guessColumnMapping, normalizeCompanyRow, scoreLead, suggestOpportunities, LEAD_IMPORT_FIELDS, type LeadImportField } from "@crm/shared";
import { CheckCircle2, Database, Download, FileUp, Globe, Radar, RefreshCw, Search, Upload } from "lucide-react";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDate, fmtDateTime, todayIsoDate } from "../lib/format";
import { downloadMultiSheetWorkbook, downloadWorkbook, parseCsv, parseWorkbook } from "../lib/export";
import { isMissingTableError, saveLeadToCrm, type LeadCompany } from "../lib/leadCrm";
import { CompanyDrawer } from "../components/leads/CompanyDrawer";
import { LeadCharts } from "../components/leads/LeadCharts";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, StatCard, TableSkeleton, Toolbar, type BadgeTone } from "../components/ui";
import { canAdmin, canWrite } from "@crm/shared";

const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
const PAGE = 50;

export type CompanyRow = LeadCompany & {
  registration_date: string | null;
  company_status: string | null;
  lead_score: number;
  score_reasons: { label: string; points: number }[];
  discovery_status: string;
  discovered_at: string | null;
  source_key: string;
  first_imported_at: string;
  nic_code: string | null;
  registered_address: string | null;
  business_activity: string | null;
  company_class: string | null;
  company_category: string | null;
  paid_up_capital: number | null;
  discovery_error: string | null;
  lead_contacts?: { contact_type: string }[];
  decision_makers?: { id: string }[];
};

export const scoreTone = (s: number): BadgeTone => (s >= 75 ? "rose" : s >= 45 ? "amber" : "slate");
export const scoreLabel = (s: number) => (s >= 75 ? "Hot" : s >= 45 ? "Warm" : "Cold");
const crmTone: Record<string, BadgeTone> = { new: "slate", saved: "blue", in_pipeline: "green" };
const crmLabel: Record<string, string> = { new: "New", saved: "Saved", in_pipeline: "In pipeline" };

function errText(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
}

export function NotInstalled() {
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Lead Finder database is not set up yet</h2>
      <p className="text-sm text-ink-600 dark:text-ink-300">
        Apply <code>supabase/migrations/0028_lead_finder.sql</code> to the database (Supabase Dashboard → SQL Editor). The rest of the CRM keeps working.
      </p>
    </Card>
  );
}

export function NoAccess() {
  return (
    <Card>
      <Empty title="You do not have Lead Finder access" hint="Ask an owner or admin to switch on Lead Finder access for you on the Team page." />
    </Card>
  );
}

export function LeadFinderPage() {
  const { org } = useSession();
  const [tab, setTab] = useState<"companies" | "import" | "sources">("companies");
  if (!org?.lead_finder_access) return <NoAccess />;
  return (
    <div>
      <PageHeader
        title="Lead Finder"
        subtitle="Newly registered Indian companies from public government data, with contacts published on their own websites."
        icon={<Radar size={20} />}
      />
      <Stats orgId={org.organization_id} />
      <div className="mb-4 flex gap-1 rounded-lg border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-900 sm:inline-flex">
        {([["companies", "Companies"], ["import", "Import MCA file"], ["sources", "Sources & history"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`min-h-9 flex-1 rounded-md px-4 text-sm font-medium transition sm:flex-none ${tab === k ? "bg-primary-50 text-primary-800 ring-1 ring-primary-200 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/20" : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "companies" ? <LeadCharts orgId={org.organization_id} /> : null}
      {tab === "companies" ? <Companies onImport={() => setTab("import")} /> : tab === "import" ? <ImportTab onDone={() => setTab("companies")} /> : <SourcesTab />}
    </div>
  );
}

function Stats({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["lead-stats", orgId],
    queryFn: async () => {
      const [stats, job] = await Promise.all([
        supabase.from("lead_finder_stats").select("*").eq("organization_id", orgId).maybeSingle(),
        supabase.from("lead_import_jobs").select("finished_at").eq("organization_id", orgId).in("status", ["success", "partial"])
          .not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (stats.error) throw stats.error;
      const lastSync = (job.data?.finished_at as string | undefined) ?? null;
      return { s: stats.data as Record<string, number> | null, lastSync };
    },
  });
  if (q.error) return isMissingTableError(q.error) ? <div className="mb-4"><NotInstalled /></div> : <div className="mb-4"><ErrorBox message={errText(q.error)} /></div>;
  const s = q.data?.s ?? {};
  const n = (k: string) => Number(s[k] ?? 0);
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <StatCard label="Companies" value={n("total_companies")} tone="blue" />
      <StatCard label="Added today" value={n("added_today")} tone="teal" />
      <StatCard label="This month" value={n("added_this_month")} tone="teal" />
      <StatCard label="With website" value={n("with_website")} tone="violet" />
      <StatCard label="With email" value={n("with_email")} tone="green" />
      <StatCard label="With phone" value={n("with_phone")} tone="green" />
      <StatCard label="Decision makers" value={n("decision_makers")} tone="amber" />
      <StatCard label="Saved to CRM" value={n("saved_to_crm")} tone="slate" hint={q.data?.lastSync ? `Last sync ${fmtDateTime(q.data.lastSync)}` : "No sync yet"} />
    </div>
  );
}

function Companies({ onImport }: { onImport: () => void }) {
  const { org, user } = useSession();
  const orgId = org!.organization_id;
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [industry, setIndustry] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [score, setScore] = useState("");
  const [contact, setContact] = useState("");
  const [crm, setCrm] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<CompanyRow | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filters = { search, state, industry, from, to, score, contact, crm, status };
  const list = useQuery({
    queryKey: ["lead-companies", orgId, filters, page],
    queryFn: async () => {
      const inner = contact === "email" || contact === "phone" ? "!inner" : "";
      let q = supabase
        .from("discovered_companies")
        .select(`*, lead_contacts${inner}(contact_type), decision_makers(id)`, { count: "exact" })
        .eq("organization_id", orgId);
      const s = search.trim().replace(/[%,()]/g, " ");
      if (s) q = q.or(`company_name.ilike.%${s}%,cin.ilike.%${s.toUpperCase()}%`);
      if (state) q = q.eq("state", state);
      if (industry) q = q.eq("industry", industry);
      if (from) q = q.gte("registration_date", from);
      if (to) q = q.lte("registration_date", to);
      if (score === "hot") q = q.gte("lead_score", 75);
      if (score === "warm") q = q.gte("lead_score", 45).lt("lead_score", 75);
      if (score === "cold") q = q.lt("lead_score", 45);
      if (contact === "email" || contact === "phone") q = q.eq("lead_contacts.contact_type", contact);
      if (contact === "website") q = q.not("website", "is", null).neq("website_status", "rejected");
      if (contact === "none") q = q.is("website", null);
      if (crm) q = q.eq("crm_status", crm);
      if (status) q = q.ilike("company_status", status);
      const { data, error, count } = await q
        .order("registration_date", { ascending: false, nullsFirst: false })
        .order("lead_score", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as CompanyRow[], count: count ?? 0 };
    },
  });
  const rows = list.data?.rows ?? [];
  const total = list.data?.count ?? 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead-companies", orgId] });
    qc.invalidateQueries({ queryKey: ["lead-stats", orgId] });
  };

  const discover = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("discovered_companies").update({ discovery_status: "queued", discovery_requested_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => { setMsg({ ok: true, text: `${n} compan${n === 1 ? "y" : "ies"} queued. The worker checks about 2 websites per minute.` }); refresh(); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });

  const bulkSave = useMutation({
    mutationFn: async (addToPipeline: boolean) => {
      let ok = 0;
      const fails: string[] = [];
      for (const c of rows.filter((r) => selected.has(r.id))) {
        try { await saveLeadToCrm({ company: c, addToPipeline, userId: user!.id }); ok++; } catch (e) { fails.push(`${c.company_name}: ${errText(e)}`); }
      }
      return { ok, fails };
    },
    onSuccess: ({ ok, fails }) => { setMsg({ ok: !fails.length, text: `${ok} saved to CRM.${fails.length ? ` Failed: ${fails.slice(0, 3).join("; ")}` : ""}` }); setSelected(new Set()); refresh(); },
  });

  const exportRows = async (onlySelected: boolean) => {
    let data: CompanyRow[] = rows;
    if (!onlySelected) {
      // Export the whole filtered set (up to 5000) with contacts.
      const { data: all, error } = await supabase.from("discovered_companies").select("*, lead_contacts(contact_type, contact_value, contact_kind, source_url, verification_status)")
        .eq("organization_id", orgId).order("registration_date", { ascending: false }).limit(5000);
      if (error) return setMsg({ ok: false, text: errText(error) });
      data = (all ?? []) as CompanyRow[];
    } else data = rows.filter((r) => selected.has(r.id));
    const sheet = data.map((c) => {
      const cs = (c.lead_contacts ?? []) as unknown as { contact_type: string; contact_value: string; source_url: string | null; verification_status: string }[];
      return {
        "Company Name": c.company_name, CIN: c.cin, "Registration Date": c.registration_date ?? "", Status: c.company_status ?? "", State: c.state ?? "", City: c.city ?? "",
        Industry: c.industry, Website: c.website ?? "", "Website Status": c.website_status,
        "Business Email": cs.filter((x) => x.contact_type === "email").map((x) => x.contact_value).join(", "),
        "Business Phone": cs.filter((x) => x.contact_type === "phone").map((x) => x.contact_value).join(", "),
        "Contact Source URLs": [...new Set(cs.map((x) => x.source_url).filter(Boolean))].join(" "),
        "Lead Score": c.lead_score, "Lead Category": scoreLabel(c.lead_score), "Suggested Opportunities": c.opportunities.join(", "),
        "CRM Status": crmLabel[c.crm_status], "Data Source": c.source_key, "Source URL": c.source_url ?? "", "Imported At": c.first_imported_at,
      };
    });
    if (onlySelected) return downloadWorkbook(`lead-finder-selected-${todayIsoDate()}.xlsx`, sheet, "Companies");
    const today = todayIsoDate();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    downloadMultiSheetWorkbook(`lead-finder-${today}.xlsx`, [
      { name: "All companies", rows: sheet },
      { name: "Imported today", rows: sheet.filter((r) => String(r["Imported At"]).slice(0, 10) === today) },
      { name: "Registered this week", rows: sheet.filter((r) => r["Registration Date"] >= weekAgo) },
      { name: "With email", rows: sheet.filter((r) => r["Business Email"]) },
      { name: "With phone", rows: sheet.filter((r) => r["Business Phone"]) },
      { name: "Hot leads", rows: sheet.filter((r) => r["Lead Category"] === "Hot") },
    ]);
  };

  if (list.error && isMissingTableError(list.error)) return null;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <Toolbar>
        <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input className="pl-9" placeholder="Company name or CIN" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select aria-label="State" value={state} onChange={(e) => { setState(e.target.value); setPage(0); }} className="sm:w-44"><option value="">All states</option>{STATES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Industry" value={industry} onChange={(e) => { setIndustry(e.target.value); setPage(0); }} className="sm:w-44"><option value="">All industries</option>{INDUSTRIES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Contact availability" value={contact} onChange={(e) => { setContact(e.target.value); setPage(0); }} className="sm:w-40">
          <option value="">Any contact</option><option value="email">Has email</option><option value="phone">Has phone</option><option value="website">Has website</option><option value="none">No website</option>
        </Select>
        <Select aria-label="Lead score" value={score} onChange={(e) => { setScore(e.target.value); setPage(0); }} className="sm:w-32"><option value="">Any score</option><option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option></Select>
        <Select aria-label="CRM status" value={crm} onChange={(e) => { setCrm(e.target.value); setPage(0); }} className="sm:w-36"><option value="">Any CRM status</option><option value="new">New</option><option value="saved">Saved</option><option value="in_pipeline">In pipeline</option></Select>
        <Select aria-label="Company status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="sm:w-32"><option value="">Any status</option><option value="active">Active</option><option value="%strike%">Struck off</option></Select>
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="Registered from" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="sm:w-[150px]" />
          <span className="text-xs text-ink-400">to</span>
          <Input type="date" aria-label="Registered to" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="sm:w-[150px]" />
        </div>
      </Toolbar>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-600 dark:text-ink-300">{total.toLocaleString("en-IN")} companies{selected.size ? ` · ${selected.size} selected` : ""}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {selected.size && writable ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => discover.mutate([...selected])} disabled={discover.isPending}><Globe size={14} /> Discover contacts</Button>
              <Button size="sm" variant="secondary" onClick={() => bulkSave.mutate(false)} disabled={bulkSave.isPending}>Save to CRM</Button>
              <Button size="sm" onClick={() => bulkSave.mutate(true)} disabled={bulkSave.isPending}>Save + add to pipeline</Button>
            </>
          ) : null}
          {selected.size ? <Button size="sm" variant="secondary" onClick={() => void exportRows(true)}><Download size={14} /> Export selected</Button> : null}
          <Button size="sm" variant="secondary" onClick={() => void exportRows(false)}><Download size={14} /> Excel reports</Button>
          <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw size={14} /></Button>
        </div>
      </div>
      {msg ? <div className={`mb-3 rounded-control border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"}`}>{msg.text}</div> : null}

      <Card className="p-0 sm:p-0">
        {list.isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} /></div>
        ) : list.error ? (
          <div className="p-4"><ErrorBox message={errText(list.error)} /></div>
        ) : !rows.length ? (
          <div className="p-6">
            <Empty
              title="No companies yet"
              hint="Import the official MCA monthly list of newly registered companies to start. Nothing is shown until real data is imported."
              icon={<Database size={20} />}
              action={writable ? <Button onClick={onImport}><FileUp size={15} /> Import MCA file</Button> : undefined}
            />
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="w-8"><input type="checkbox" aria-label="Select page" className="accent-primary-500" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                  <th>Company</th><th>CIN</th><th>Registered</th><th>State</th><th>Industry</th><th>Website</th><th>Contacts</th><th>Score</th><th>CRM</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const types = new Set((c.lead_contacts ?? []).map((x) => x.contact_type));
                  return (
                    <tr key={c.id}>
                      <td><input type="checkbox" aria-label={`Select ${c.company_name}`} className="accent-primary-500" checked={selected.has(c.id)} onChange={() => { const s = new Set(selected); s.has(c.id) ? s.delete(c.id) : s.add(c.id); setSelected(s); }} /></td>
                      <td className="max-w-[240px]">
                        <button type="button" onClick={() => setOpen(c)} className="block max-w-full truncate text-left font-semibold text-ink-900 hover:text-primary-700 hover:underline dark:text-white">{c.company_name}</button>
                        {c.opportunities[0] ? <span className="block truncate text-2xs text-ink-500">Suggested: {c.opportunities.slice(0, 3).join(", ")}</span> : null}
                      </td>
                      <td className="whitespace-nowrap font-mono text-xs">{c.cin}</td>
                      <td className="whitespace-nowrap">{fmtDate(c.registration_date)}</td>
                      <td className="max-w-[140px] truncate">{c.state ?? "—"}</td>
                      <td className="max-w-[160px] truncate">{c.industry}</td>
                      <td className="max-w-[160px] truncate">
                        {c.website && c.website_status !== "rejected" ? (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline dark:text-primary-300">{c.website.replace(/^https?:\/\//, "")}</a>
                        ) : <span className="text-ink-400">Not available</span>}
                        {c.website_status === "suggested" ? <span className="ml-1 text-2xs text-amber-600">(unconfirmed)</span> : null}
                      </td>
                      <td className="whitespace-nowrap">
                        {types.has("email") ? <Badge tone="green">Email</Badge> : null} {types.has("phone") ? <Badge tone="green">Phone</Badge> : null}
                        {(c.decision_makers?.length ?? 0) > 0 ? <Badge tone="violet">{c.decision_makers!.length} people</Badge> : null}
                        {!types.size && !(c.decision_makers?.length) ? <span className="text-xs text-ink-400">{c.discovery_status === "queued" || c.discovery_status === "running" ? "Checking…" : c.discovery_status === "pending" ? "Not checked" : "Not available"}</span> : null}
                      </td>
                      <td><Badge tone={scoreTone(c.lead_score)}>{c.lead_score} · {scoreLabel(c.lead_score)}</Badge></td>
                      <td><Badge tone={crmTone[c.crm_status]}>{crmLabel[c.crm_status]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {total > PAGE ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page + 1} of {pages}</span>
          <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      ) : null}
      {open ? <CompanyDrawer companyId={open.id} onClose={() => { setOpen(null); refresh(); }} /> : null}
    </>
  );
}

/* --------------------------------- Import --------------------------------- */

function ImportTab({ onDone }: { onDone: () => void }) {
  const { org, user } = useSession();
  const orgId = org!.organization_id;
  const writable = canWrite(org?.role);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<LeadImportField, string>>>({});
  const [recentOnly, setRecentOnly] = useState(true);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ inserted: number; duplicates: number; rejected: { row: number; error: string; data: Record<string, unknown> }[]; skippedOld: number } | null>(null);
  const [error, setError] = useState("");

  const load = async (file?: File | null) => {
    if (!file) return;
    setError(""); setResult(null);
    if (file.size > 40 * 1024 * 1024) return setError("File is larger than 40 MB.");
    try {
      const parsed = /\.csv$/i.test(file.name) ? parseCsv(await file.text()) : parseWorkbook(await file.arrayBuffer());
      if (!parsed.rows.length) return setError("No rows found in the file.");
      setFileName(file.name); setHeaders(parsed.headers); setRawRows(parsed.rows); setMap(guessColumnMapping(parsed.headers));
    } catch (e) {
      setError(`Could not read the file: ${errText(e)}`);
    }
  };

  const normalized = useMemo(() => rawRows.map((r) => normalizeCompanyRow(r, map)), [rawRows, map]);
  const valid = normalized.filter((n) => n.ok).length;
  const cutoff = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);

  const run = async () => {
    if (!map.cin || !map.company_name) return setError("Map at least the CIN and Company Name columns.");
    setError(""); setResult(null);
    const job = await supabase.from("lead_import_jobs").insert({ organization_id: orgId, source_key: "mca_excel", kind: "company_import", status: "running", file_name: fileName, created_by: user!.id }).select("id").single();
    if (job.error) return setError(errText(job.error));
    const rejected: { row: number; error: string; data: Record<string, unknown> }[] = [];
    const toInsert: Record<string, unknown>[] = [];
    let skippedOld = 0;
    const seen = new Set<string>();
    const emailsByCin = new Map<string, string>();
    normalized.forEach((n, i) => {
      if (!n.ok) return rejected.push({ row: i + 2, error: n.error, data: rawRows[i]! });
      if (recentOnly && n.value.registration_date && n.value.registration_date < cutoff) { skippedOld++; return; }
      if (seen.has(n.value.cin)) return rejected.push({ row: i + 2, error: "Duplicate CIN inside the file", data: rawRows[i]! });
      seen.add(n.value.cin);
      const s = scoreLead({ registrationDate: n.value.registration_date, hasWebsite: false, hasBusinessEmail: false, hasBusinessPhone: false, industry: n.value.industry });
      const { registered_email, ...company } = n.value;
      const siteGuess = websiteFromEmail(registered_email);
      if (registered_email) emailsByCin.set(company.cin, registered_email);
      toInsert.push({ ...company, website: siteGuess ? `https://${siteGuess}` : null, website_status: siteGuess ? "suggested" : "none", organization_id: orgId, source_key: "mca_excel", source_url: "https://www.mca.gov.in/content/mca/global/en/data-and-reports/company-llp-info/incorporated-closed-month.html",
        import_job_id: job.data.id, lead_score: s.score, score_reasons: s.reasons, opportunities: suggestOpportunities(n.value.industry, false) });
    });
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      setProgress(`Importing ${Math.min(i + 500, toInsert.length)} of ${toInsert.length}…`);
      const batch = toInsert.slice(i, i + 500);
      const { data, error: e } = await supabase.from("discovered_companies").upsert(batch, { onConflict: "organization_id,cin", ignoreDuplicates: true }).select("id, cin");
      if (e) {
        batch.forEach((b) => rejected.push({ row: 0, error: errText(e), data: b }));
        continue;
      }
      inserted += data?.length ?? 0;
      // Email registered with MCA = public government record, stored as the company's contact.
      const contacts = (data ?? []).filter((d) => emailsByCin.has(d.cin as string)).map((d) => ({
        organization_id: orgId, company_id: d.id, contact_type: "email", contact_value: emailsByCin.get(d.cin as string)!,
        contact_kind: "company_general", source_url: "https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html",
        verification_status: "publicly_listed", confidence_score: 40, created_by: user!.id,
      }));
      // Only newly inserted companies are returned, so these contacts cannot already exist.
      if (contacts.length) await supabase.from("lead_contacts").insert(contacts);
    }
    const duplicates = toInsert.length - inserted - rejected.filter((r) => r.row === 0).length;
    await supabase.from("lead_import_jobs").update({
      status: rejected.length ? (inserted ? "partial" : "failed") : "success",
      fetched_count: rawRows.length, inserted_count: inserted, duplicate_count: Math.max(0, duplicates), failed_count: rejected.length,
      errors: rejected.slice(0, 200).map((r) => `Row ${r.row}: ${r.error}`), message: skippedOld ? `${skippedOld} older than 6 months skipped` : null,
      finished_at: new Date().toISOString(),
    }).eq("id", job.data.id);
    setProgress("");
    setResult({ inserted, duplicates: Math.max(0, duplicates), rejected, skippedOld });
    qc.invalidateQueries({ queryKey: ["lead-companies", orgId] });
    qc.invalidateQueries({ queryKey: ["lead-stats", orgId] });
    qc.invalidateQueries({ queryKey: ["lead-jobs", orgId] });
  };

  if (!writable) return <Card><Empty title="Viewers cannot import" /></Card>;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">1. Download the official file</h2>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          MCA does not allow automated downloads. Open MCA → Data &amp; Reports → Company/LLP Info → <b>Incorporated or Closed during the month</b>, download the latest
          "Companies registered" Excel in your browser, then upload it below. MCA publishes it monthly, usually 1-2 months after incorporation.
        </p>
        <a className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300" target="_blank" rel="noopener noreferrer"
          href="https://www.mca.gov.in/content/mca/global/en/data-and-reports/company-llp-info/incorporated-closed-month.html">Open MCA monthly data page ↗</a>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">2. Upload Excel or CSV</h2>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-300 p-8 text-center hover:border-primary-400 dark:border-ink-700"
        >
          <Upload size={22} className="text-ink-400" />
          <p className="text-sm text-ink-700 dark:text-ink-200">{fileName ? `${fileName} · ${rawRows.length.toLocaleString("en-IN")} rows` : "Drag and drop the file here, or click to choose (.xlsx, .xls, .csv)"}</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
        </div>
        {error ? <ErrorBox message={error} /> : null}
      </Card>

      {rawRows.length ? (
        <Card className="space-y-4">
          <h2 className="font-semibold">3. Check column mapping</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEAD_IMPORT_FIELDS.map((f) => (
              <Field key={f} label={f.replace(/_/g, " ")} required={f === "cin" || f === "company_name"}>
                <Select value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value || undefined })}>
                  <option value="">— not in file —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
            <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={recentOnly} onChange={(e) => setRecentOnly(e.target.checked)} />
            Only import companies registered in the last 6 months (keeps the free database small)
          </label>
          <p className="text-sm">
            <b>{valid.toLocaleString("en-IN")}</b> valid · <b className="text-rose-600">{(normalized.length - valid).toLocaleString("en-IN")}</b> invalid of {normalized.length.toLocaleString("en-IN")} rows
          </p>
          <div className="table-scroll">
            <table className="w-full text-xs">
              <thead><tr><th>Row</th><th>CIN</th><th>Company</th><th>Registered</th><th>State</th><th>Industry</th><th>Result</th></tr></thead>
              <tbody>
                {normalized.slice(0, 10).map((n, i) => (
                  <tr key={i}>
                    <td>{i + 2}</td>
                    {n.ok ? (
                      <><td className="font-mono">{n.value.cin}</td><td>{n.value.company_name}</td><td>{n.value.registration_date ?? "—"}</td><td>{n.value.state ?? "—"}</td><td>{n.value.industry}</td><td><Badge tone="green">OK</Badge></td></>
                    ) : (
                      <><td colSpan={5} className="text-rose-600">{n.error}</td><td><Badge tone="rose">Rejected</Badge></td></>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void run()} disabled={Boolean(progress) || !valid}>{progress || `Import ${valid.toLocaleString("en-IN")} companies`}</Button>
            <span className="text-xs text-ink-500">Existing CINs are skipped, never duplicated.</span>
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} className="text-emerald-600" /> Import finished</h2>
          <p className="text-sm">{result.inserted.toLocaleString("en-IN")} new · {result.duplicates.toLocaleString("en-IN")} already existed · {result.rejected.length} rejected{result.skippedOld ? ` · ${result.skippedOld} older than 6 months skipped` : ""}</p>
          <div className="flex gap-2">
            {result.rejected.length ? (
              <Button variant="secondary" onClick={() => downloadWorkbook(`rejected-rows-${todayIsoDate()}.xlsx`, result.rejected.map((r) => ({ Row: r.row, Error: r.error, ...r.data })), "Rejected")}>
                <Download size={15} /> Download rejected rows
              </Button>
            ) : null}
            <Button onClick={onDone}>View companies</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* --------------------------------- Sources -------------------------------- */

function SourcesTab() {
  const { org } = useSession();
  const orgId = org!.organization_id;
  const admin = canAdmin(org?.role);
  const qc = useQueryClient();
  const sources = useQuery({
    queryKey: ["lead-sources", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_sources").select("*").eq("organization_id", orgId).order("access_mode");
      if (error) throw error;
      return data ?? [];
    },
  });
  const jobs = useQuery({
    queryKey: ["lead-jobs", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_import_jobs").select("*").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("lead_sources").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-sources", orgId] }),
  });
  const modeTone: Record<string, BadgeTone> = { automatic: "green", manual_upload: "blue", optional_credential: "amber", manual_only: "slate" };
  const modeLabel: Record<string, string> = { automatic: "Automatic", manual_upload: "Manual upload", optional_credential: "Optional (needs key)", manual_only: "Manual only" };
  const statusTone: Record<string, BadgeTone> = { ok: "green", error: "rose", not_configured: "amber", not_run: "slate", manual: "blue" };

  return (
    <div className="space-y-4">
      <Card className="p-0 sm:p-0">
        {sources.isLoading ? <div className="p-4"><TableSkeleton rows={4} /></div> : sources.error ? <div className="p-4"><ErrorBox message={errText(sources.error)} /></div> : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead><tr><th>Source</th><th>Access</th><th>Status</th><th>Last success</th><th>Limits &amp; notes</th><th>On</th><th>Daily limit</th></tr></thead>
              <tbody>
                {sources.data!.map((s) => (
                  <tr key={s.id}>
                    <td className="min-w-[180px] font-medium">{s.docs_url ? <a href={s.docs_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.name} ↗</a> : s.name}</td>
                    <td><Badge tone={modeTone[s.access_mode] ?? "slate"}>{modeLabel[s.access_mode] ?? s.access_mode}</Badge></td>
                    <td><Badge tone={statusTone[s.status] ?? "slate"}>{s.status.replace(/_/g, " ")}</Badge>{s.last_error ? <span className="block max-w-[200px] truncate text-2xs text-rose-600" title={s.last_error}>{s.last_error}</span> : null}</td>
                    <td className="whitespace-nowrap text-xs">{s.last_success_at ? fmtDateTime(s.last_success_at) : "—"}{s.source_updated_at ? <span className="block text-2xs text-ink-500">Data updated {fmtDate(s.source_updated_at)}</span> : null}</td>
                    <td className="min-w-[260px] text-xs text-ink-600 dark:text-ink-300">{s.limitations}</td>
                    <td>
                      {s.access_mode === "manual_only" ? "—" : (
                        <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={s.enabled} disabled={!admin || update.isPending} onChange={(e) => update.mutate({ id: s.id, patch: { enabled: e.target.checked } })} aria-label={`Enable ${s.name}`} />
                      )}
                    </td>
                    <td>
                      {s.source_key === "website_discovery" ? (
                        <Input type="number" min={0} max={500} className="w-20" defaultValue={s.daily_limit} disabled={!admin}
                          onBlur={(e) => { const v = Math.max(0, Math.min(500, Number(e.target.value) || 0)); if (v !== s.daily_limit) update.mutate({ id: s.id, patch: { daily_limit: v } }); }} />
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="p-0 sm:p-0">
        <h2 className="px-4 pt-4 font-semibold">Import &amp; discovery history</h2>
        {jobs.isLoading ? <div className="p-4"><TableSkeleton rows={4} /></div> : !jobs.data?.length ? <div className="p-6"><Empty title="No runs yet" /></div> : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead><tr><th>Started</th><th>Source</th><th>Type</th><th>Status</th><th>Fetched</th><th>New</th><th>Duplicates</th><th>Failed</th><th>Details</th></tr></thead>
              <tbody>
                {jobs.data.map((j) => (
                  <tr key={j.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(j.started_at)}</td>
                    <td>{j.source_key}</td>
                    <td className="text-xs">{j.kind === "company_import" ? "Company import" : "Contact discovery"}</td>
                    <td><Badge tone={j.status === "success" ? "green" : j.status === "failed" ? "rose" : j.status === "running" ? "blue" : "amber"}>{j.status}</Badge></td>
                    <td>{j.fetched_count}</td><td>{j.inserted_count}</td><td>{j.duplicate_count}</td><td>{j.failed_count}</td>
                    <td className="max-w-[280px] truncate text-xs" title={[j.file_name, j.message, ...(j.errors ?? [])].filter(Boolean).join("\n")}>{j.file_name ?? j.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
