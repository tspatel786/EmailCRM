import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ROLE_LABELS, type Role } from "@crm/shared";
import { Download, Linkedin, Mail, Phone, UserSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { fmtDate, telHref, todayIsoDate } from "../lib/format";
import { downloadMultiSheetWorkbook } from "../lib/export";
import { isMissingTableError } from "../lib/leadCrm";
import { CompanyDrawer } from "../components/leads/CompanyDrawer";
import { SimpleBar } from "../components/leads/LeadCharts";
import { NoAccess, NotInstalled } from "./LeadFinder";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Select, StatCard, TableSkeleton, Toolbar } from "../components/ui";

type Row = {
  id: string;
  company_id: string;
  full_name: string;
  original_designation: string | null;
  roles: Role[];
  linkedin_url: string | null;
  source_type: string;
  source_url: string | null;
  verification_status: string;
  confidence_score: number;
  created_at: string;
  crm_contact_id: string | null;
  discovered_companies: { company_name: string; cin: string; state: string | null; industry: string } | null;
  lead_contacts: { contact_type: string; contact_value: string; contact_kind: string; source_url: string | null; verification_status: string }[];
};

const TABS: { key: string; label: string; match: (r: Row) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "ceo", label: "CEO & Founder", match: (r) => r.roles.some((x) => x === "ceo" || x === "founder") },
  { key: "dir", label: "Directors & Owners", match: (r) => r.roles.some((x) => x === "director" || x === "owner" || x === "managing_director") },
  { key: "it", label: "IT Managers", match: (r) => r.roles.includes("it_manager") },
  { key: "purchase", label: "Purchase Managers", match: (r) => r.roles.includes("purchase_manager") },
  { key: "missing", label: "Missing contacts", match: (r) => !r.lead_contacts.length },
];

function errText(e: unknown) {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
}

export function DecisionMakersPage() {
  const { org } = useSession();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [conf, setConf] = useState("");
  const [contact, setContact] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["decision-makers", org?.organization_id],
    enabled: Boolean(org?.lead_finder_access),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_makers")
        .select("*, discovered_companies(company_name, cin, state, industry), lead_contacts(contact_type, contact_value, contact_kind, source_url, verification_status)")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, discovered_companies: Array.isArray(r.discovered_companies) ? r.discovered_companies[0] : r.discovered_companies })) as Row[];
    },
  });

  const rows = q.data ?? [];
  const states = useMemo(() => [...new Set(rows.map((r) => r.discovered_companies?.state).filter(Boolean) as string[])].sort(), [rows]);
  const filtered = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!t.match(r)) return false;
      if (state && r.discovered_companies?.state !== state) return false;
      if (conf === "high" && r.confidence_score < 80) return false;
      if (conf === "medium" && (r.confidence_score < 50 || r.confidence_score >= 80)) return false;
      if (conf === "low" && r.confidence_score >= 50) return false;
      const hasE = r.lead_contacts.some((c) => c.contact_type === "email");
      const hasP = r.lead_contacts.some((c) => c.contact_type === "phone");
      if (contact === "email" && !hasE) return false;
      if (contact === "phone" && !hasP) return false;
      if (contact === "both" && !(hasE && hasP)) return false;
      if (!s) return true;
      return [r.full_name, r.original_designation, r.discovered_companies?.company_name, r.discovered_companies?.cin].some((v) => v?.toLowerCase().includes(s));
    });
  }, [rows, tab, search, state, conf, contact]);

  const today = todayIsoDate();
  const stats = {
    total: rows.length,
    email: rows.filter((r) => r.lead_contacts.some((c) => c.contact_type === "email")).length,
    phone: rows.filter((r) => r.lead_contacts.some((c) => c.contact_type === "phone")).length,
    high: rows.filter((r) => r.confidence_score >= 80).length,
    missing: rows.filter((r) => !r.lead_contacts.length).length,
    todayCount: rows.filter((r) => r.created_at.slice(0, 10) === today).length,
  };

  const exportAll = () => {
    const toRow = (r: Row) => ({
      "Company Name": r.discovered_companies?.company_name ?? "", CIN: r.discovered_companies?.cin ?? "", "Person Name": r.full_name,
      Designation: r.original_designation ?? "", Roles: r.roles.map((x) => ROLE_LABELS[x]).join(", "),
      "Business Email": r.lead_contacts.filter((c) => c.contact_type === "email").map((c) => c.contact_value).join(", ") || "Not Available",
      "Public Business Phone": r.lead_contacts.filter((c) => c.contact_type === "phone").map((c) => c.contact_value).join(", ") || "Not Available",
      "LinkedIn URL": r.linkedin_url ?? "", "Source URL": r.source_url ?? "", "Confidence Score": r.confidence_score,
      "Verification Status": r.verification_status, "Discovery Date": r.created_at.slice(0, 10), State: r.discovered_companies?.state ?? "",
    });
    const sheet = (key: string) => rows.filter(TABS.find((t) => t.key === key)!.match).map(toRow);
    downloadMultiSheetWorkbook(`decision-makers-${today}.xlsx`, [
      { name: "All decision makers", rows: rows.map(toRow) },
      { name: "CEO & Founder", rows: sheet("ceo") },
      { name: "Directors & Owners", rows: sheet("dir") },
      { name: "IT Managers", rows: sheet("it") },
      { name: "Purchase Managers", rows: sheet("purchase") },
      { name: "Email and phone", rows: rows.filter((r) => r.lead_contacts.some((c) => c.contact_type === "email") && r.lead_contacts.some((c) => c.contact_type === "phone")).map(toRow) },
      { name: "Missing contact details", rows: sheet("missing") },
      { name: "High confidence", rows: rows.filter((r) => r.confidence_score >= 80).map(toRow) },
      { name: "Added today", rows: rows.filter((r) => r.created_at.slice(0, 10) === today).map(toRow) },
    ]);
  };

  if (!org?.lead_finder_access) return <NoAccess />;

  return (
    <div>
      <PageHeader
        title="Decision Makers"
        subtitle="People published with their designation on company websites or added manually with a source. Contacts are shown only when publicly listed."
        icon={<UserSearch size={20} />}
        actions={<Button variant="secondary" onClick={exportAll} disabled={!rows.length}><Download size={16} /> Excel reports</Button>}
      />
      {q.error && isMissingTableError(q.error) ? <NotInstalled /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Decision makers" value={stats.total} tone="violet" />
            <StatCard label="With business email" value={stats.email} tone="green" />
            <StatCard label="With business phone" value={stats.phone} tone="green" />
            <StatCard label="High confidence" value={stats.high} tone="blue" />
            <StatCard label="Missing contacts" value={stats.missing} tone="slate" />
            <StatCard label="Added today" value={stats.todayCount} tone="teal" />
          </div>
          {rows.length ? (
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <SimpleBar title="Decision makers by role" data={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ name: ROLE_LABELS[r], n: rows.filter((x) => x.roles.includes(r)).length })).filter((p) => p.n)} color="#8b5cf6" horizontal />
              <SimpleBar title="Contact availability" data={[
                { name: "Email + phone", n: rows.filter((r) => r.lead_contacts.some((c) => c.contact_type === "email") && r.lead_contacts.some((c) => c.contact_type === "phone")).length },
                { name: "Email only", n: rows.filter((r) => r.lead_contacts.some((c) => c.contact_type === "email") && !r.lead_contacts.some((c) => c.contact_type === "phone")).length },
                { name: "Phone only", n: rows.filter((r) => !r.lead_contacts.some((c) => c.contact_type === "email") && r.lead_contacts.some((c) => c.contact_type === "phone")).length },
                { name: "None", n: rows.filter((r) => !r.lead_contacts.length).length },
              ]} color="#10b981" />
            </div>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium ${tab === t.key ? "bg-primary-50 text-primary-800 ring-1 ring-primary-200 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/20" : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800"}`}>
                {t.label} <span className="text-xs text-ink-400">{rows.filter(t.match).length}</span>
              </button>
            ))}
          </div>
          <Toolbar>
            <div className="min-w-0 flex-1 sm:min-w-[220px]"><Input placeholder="Name, designation, company or CIN" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Select aria-label="State" value={state} onChange={(e) => setState(e.target.value)} className="sm:w-44"><option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}</Select>
            <Select aria-label="Contact availability" value={contact} onChange={(e) => setContact(e.target.value)} className="sm:w-40"><option value="">Any contact</option><option value="email">Has email</option><option value="phone">Has phone</option><option value="both">Email and phone</option></Select>
            <Select aria-label="Confidence" value={conf} onChange={(e) => setConf(e.target.value)} className="sm:w-36"><option value="">Any confidence</option><option value="high">High (80+)</option><option value="medium">Medium</option><option value="low">Low</option></Select>
          </Toolbar>
          <Card className="p-0 sm:p-0">
            {q.isLoading ? <div className="p-4"><TableSkeleton rows={6} /></div> : q.error ? <div className="p-4"><ErrorBox message={errText(q.error)} /></div> : !filtered.length ? (
              <div className="p-6"><Empty title="No decision makers" hint="They appear when a company's website publishes names with designations, or when your team adds them with a source from a company's page in New Companies." icon={<UserSearch size={20} />} /></div>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead><tr><th>Person</th><th>Company</th><th>Designation</th><th>Professional email</th><th>Business phone</th><th>LinkedIn</th><th>Confidence</th><th>Source</th><th>Found</th><th>CRM</th></tr></thead>
                  <tbody>
                    {filtered.map((r) => {
                      const emails = r.lead_contacts.filter((c) => c.contact_type === "email");
                      const phones = r.lead_contacts.filter((c) => c.contact_type === "phone");
                      return (
                        <tr key={r.id}>
                          <td className="font-semibold">{r.full_name}<div className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x} tone="violet">{ROLE_LABELS[x]}</Badge>)}</div></td>
                          <td className="max-w-[200px]">
                            <button type="button" className="truncate text-left text-primary-700 hover:underline dark:text-primary-300" onClick={() => setOpen(r.company_id)}>{r.discovered_companies?.company_name ?? "—"}</button>
                            <span className="block text-2xs text-ink-500">{r.discovered_companies?.state ?? ""}</span>
                          </td>
                          <td className="max-w-[180px] truncate">{r.original_designation ?? "—"}</td>
                          <td>{emails.length ? emails.map((e) => <a key={e.contact_value} href={`mailto:${e.contact_value}`} className="flex items-center gap-1 text-primary-700 hover:underline dark:text-primary-300"><Mail size={12} />{e.contact_value}</a>) : <span className="text-ink-400">Not Available</span>}</td>
                          <td>{phones.length ? phones.map((p) => <a key={p.contact_value} href={telHref(p.contact_value) ?? undefined} className="flex items-center gap-1 text-primary-700 hover:underline dark:text-primary-300"><Phone size={12} />{p.contact_value}</a>) : <span className="text-ink-400">Not Available</span>}</td>
                          <td>{r.linkedin_url ? <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn profile" className="text-primary-700 dark:text-primary-300"><Linkedin size={15} /></a> : <span className="text-ink-400">—</span>}</td>
                          <td><Badge tone={r.confidence_score >= 80 ? "green" : r.confidence_score >= 50 ? "amber" : "slate"}>{r.confidence_score}</Badge></td>
                          <td className="max-w-[140px] truncate text-xs">{r.source_url ? <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.source_type === "manual" ? "Manual" : "Website"} ↗</a> : r.source_type}</td>
                          <td className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</td>
                          <td>{r.crm_contact_id ? <Link to={`/app/contacts/${r.crm_contact_id}`} className="text-xs text-primary-700 hover:underline dark:text-primary-300">In CRM</Link> : <span className="text-xs text-ink-400">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {open ? <CompanyDrawer companyId={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
