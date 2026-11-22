// Lead Finder worker jobs.
//  1. Contact discovery: reads a company's OWN public website (home + Contact/About/Team pages),
//     respecting robots.txt, and stores published emails, phones and people with their source URL.
//     Never guesses addresses, never touches LinkedIn/MCA (manual only), never bypasses blocks.
//  2. Optional data.gov.in import: runs only when DATA_GOV_IN_API_KEY is set on the worker.
// Every function tolerates the Lead Finder tables not existing yet (migration 0028 not applied).
import {
  candidateDomains,
  contactConfidence,
  extractEmails,
  extractPeople,
  extractPhones,
  htmlToLines,
  matchRoles,
  normalizeCompanyRow,
  pageMatchesCompany,
  scoreLead,
  suggestOpportunities,
  type Industry,
} from "@crm/shared";
import { admin } from "./db.js";

const UA = "SMPatelITHub-LeadFinder/1.0 (+https://smpatelithub.in; public business contact discovery)";
const PAGE_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;
const MAX_PAGES = 6;
const LINK_HINT = /contact|about|team|leadership|management|board|director|people|reach|connect/i;

let tablesMissingLogged = false;
function missingTables(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const missing = err.code === "42P01" || err.code === "PGRST205" || /does not exist|Could not find the table/i.test(err.message ?? "");
  if (missing && !tablesMissingLogged) {
    tablesMissingLogged = true;
    console.warn(JSON.stringify({ msg: "lead-finder-tables-missing", hint: "Apply supabase/migrations/0028_lead_finder.sql" }));
  }
  return missing;
}

/* --------------------------------- HTTP ---------------------------------- */

async function fetchText(url: string): Promise<{ ok: boolean; status: number; url: string; text: string; type: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/text\/html|xhtml|text\/plain/i.test(type)) return { ok: false, status: res.status, url: res.url, text: "", type };
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, status: res.status, url: res.url, text: "", type };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { ok: true, status: res.status, url: res.url, text: Buffer.concat(chunks).toString("utf8"), type };
  } catch {
    return { ok: false, status: 0, url, text: "", type: "" };
  }
}

/** Minimal robots.txt check for our user agent (and *). Unreachable robots.txt = allowed. */
const robotsCache = new Map<string, string[]>();
async function allowedByRobots(url: URL): Promise<boolean> {
  const origin = url.origin;
  if (!robotsCache.has(origin)) {
    const r = await fetchText(`${origin}/robots.txt`).catch(() => null);
    const disallow: string[] = [];
    if (r?.ok) {
      let applies = false;
      for (const raw of r.text.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, "").trim();
        const [k, ...rest] = line.split(":");
        const v = rest.join(":").trim();
        if (!k) continue;
        if (/^user-agent$/i.test(k)) applies = v === "*" || /smpatel|leadfinder/i.test(v);
        else if (applies && /^disallow$/i.test(k) && v) disallow.push(v);
      }
    }
    robotsCache.set(origin, disallow);
    if (robotsCache.size > 500) robotsCache.delete(robotsCache.keys().next().value!);
  }
  const rules = robotsCache.get(origin)!;
  return !rules.some((p) => p === "/" || url.pathname.startsWith(p));
}

function isPublicHost(host: string): boolean {
  // Never fetch internal/private addresses (SSRF protection for user-entered websites).
  return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[|::1)/i.test(host) && /\.[a-z]{2,}$/i.test(host);
}

/* ------------------------------ Discovery -------------------------------- */

type CompanyRow = {
  id: string;
  organization_id: string;
  cin: string;
  company_name: string;
  website: string | null;
  website_status: string;
  registration_date: string | null;
  industry: string;
};

async function findWebsite(c: CompanyRow): Promise<{ url: string; status: "confirmed" | "suggested" } | null> {
  if (c.website && c.website_status === "confirmed") return { url: c.website, status: "confirmed" };
  if (c.website && c.website_status === "suggested") {
    // Suggested = from the MCA-registered email domain or an earlier auto-match. Use it only if it loads.
    const page = await fetchText(c.website);
    if (page.ok) {
      const text = htmlToLines(page.text).join(" ");
      return { url: new URL(page.url).origin, status: text.toUpperCase().includes(c.cin) ? "confirmed" : "suggested" };
    }
  }
  for (const domain of candidateDomains(c.company_name)) {
    const page = await fetchText(`https://${domain}/`);
    if (!page.ok) continue;
    const text = htmlToLines(page.text).join(" ");
    // A domain is only used when its own page names this company (or shows its CIN).
    if (pageMatchesCompany(text, c.company_name, c.cin)) {
      return { url: new URL(page.url).origin, status: text.toUpperCase().includes(c.cin) ? "confirmed" : "suggested" };
    }
  }
  return null;
}

export async function discoverCompany(c: CompanyRow): Promise<{ emails: number; phones: number; people: number; website: string | null }> {
  const site = await findWebsite(c);
  if (!site) {
    await admin.from("discovered_companies").update({ discovery_status: "no_website", discovered_at: new Date().toISOString(), discovery_error: null }).eq("id", c.id);
    return { emails: 0, phones: 0, people: 0, website: null };
  }
  const base = new URL(site.url);
  if (!isPublicHost(base.hostname)) throw new Error("Website host is not a public internet address");

  const queue: string[] = [base.href];
  const seen = new Set<string>();
  const emails = new Map<string, { kind: string; source: string }>();
  const phones = new Map<string, { kind: string; source: string }>();
  const people: { name: string; designation: string; roles: string[]; source: string; lines: string[] }[] = [];

  while (queue.length && seen.size < MAX_PAGES) {
    const href = queue.shift()!;
    if (seen.has(href)) continue;
    seen.add(href);
    const url = new URL(href);
    if (url.hostname !== base.hostname || !(await allowedByRobots(url))) continue;
    const page = await fetchText(href);
    if (!page.ok) continue;
    const source = page.url;
    for (const e of extractEmails(page.text, base.hostname)) if (!emails.has(e.email)) emails.set(e.email, { kind: e.kind, source });
    for (const p of extractPhones(page.text)) if (!phones.has(p.e164)) phones.set(p.e164, { kind: p.kind, source });
    const lines = htmlToLines(page.text);
    for (const p of extractPeople(lines)) people.push({ ...p, source, lines });
    // Follow same-site links that look like contact / about / team pages.
    for (const m of page.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
      try {
        const next = new URL(m[1]!, page.url);
        if (next.hostname === base.hostname && /^https?:$/.test(next.protocol) && (LINK_HINT.test(next.pathname) || LINK_HINT.test(m[2]!))) {
          next.hash = "";
          if (!seen.has(next.href) && queue.length < 20) queue.push(next.href);
        }
      } catch {
        /* ignore bad links */
      }
    }
    await new Promise((r) => setTimeout(r, 800)); // be polite between page requests
  }

  const now = new Date().toISOString();
  const org = c.organization_id;

  // People first, so person emails published next to a name can be linked to them.
  let peopleSaved = 0;
  for (const p of people.slice(0, 25)) {
    const personEmail = [...emails.entries()].find(([e, v]) => v.kind === "person_professional" && v.source === p.source && e.split("@")[0]!.replace(/[^a-z]/g, "").includes(p.name.split(" ")[0]!.toLowerCase()));
    const conf = contactConfidence({ officialWebsite: true, exactNameAndDesignation: true, businessEmail: Boolean(personEmail), businessPhone: false, matchingProfile: false });
    // Same company + same name + same designation = same person (case-insensitive). People
    // with the same name but a different designation are kept separate.
    const { data: existing } = await admin
      .from("decision_makers")
      .select("id, verification_status, original_designation")
      .eq("company_id", c.id)
      .ilike("full_name", p.name.replace(/[%_]/g, ""));
    const same = (existing ?? []).find((e) => (e.original_designation ?? "").toLowerCase() === p.designation.toLowerCase());
    let dmId: string | null = same?.id ?? null;
    if (!same) {
      const ins = await admin
        .from("decision_makers")
        .insert({
          organization_id: org, company_id: c.id, full_name: p.name, original_designation: p.designation, roles: p.roles,
          source_type: "company_website", source_url: p.source, verification_status: "source_confirmed",
          confidence_score: conf.score, score_reasons: conf.reasons, last_verified_at: now,
        })
        .select("id")
        .maybeSingle();
      dmId = ins.data?.id ?? null;
      if (dmId) peopleSaved++;
    } else if (same.verification_status !== "manually_verified") {
      // Refresh only the check date; never overwrite manually verified information.
      await admin.from("decision_makers").update({ last_verified_at: now }).eq("id", same.id);
    }
    if (dmId && personEmail) await saveContact(org, c.id, dmId, "email", personEmail[0], "person_professional", personEmail[1].source);
  }

  for (const [email, v] of emails) {
    if (v.kind === "person_professional") {
      // A named mailbox not tied to a published person is stored as a department contact.
      await saveContact(org, c.id, null, "email", email, "department", v.source);
    } else {
      await saveContact(org, c.id, null, "email", email, v.kind === "company_general" ? "company_general" : "department", v.source);
    }
  }
  for (const [e164, v] of phones) await saveContact(org, c.id, null, "phone", e164, v.kind, v.source);

  const scored = scoreLead({
    registrationDate: c.registration_date,
    hasWebsite: true,
    hasBusinessEmail: emails.size > 0,
    hasBusinessPhone: phones.size > 0,
    industry: (c.industry as Industry) ?? "Other",
  });
  await admin
    .from("discovered_companies")
    .update({
      website: site.url,
      website_status: c.website_status === "confirmed" ? "confirmed" : site.status,
      discovery_status: "done",
      discovered_at: now,
      discovery_error: null,
      lead_score: scored.score,
      score_reasons: scored.reasons,
      opportunities: suggestOpportunities((c.industry as Industry) ?? "Other", true),
    })
    .eq("id", c.id);
  return { emails: emails.size, phones: phones.size, people: peopleSaved, website: site.url };
}

async function saveContact(org: string, companyId: string, dmId: string | null, type: "email" | "phone", value: string, kind: string, source: string) {
  const { error } = await admin.from("lead_contacts").insert({
    organization_id: org,
    company_id: companyId,
    decision_maker_id: dmId,
    contact_type: type,
    contact_value: value,
    contact_kind: kind,
    source_url: source,
    verification_status: "website_confirmed",
    confidence_score: kind === "person_professional" ? 75 : 45,
  });
  // 23505 = already stored (unique per company + type + value): keep the existing record.
  if (error && error.code !== "23505") console.warn(JSON.stringify({ msg: "lead-contact-save-failed", error: error.message }));
}

/* ------------------------------- Queue loop ------------------------------- */

let lastDailyEnqueue = "";

/** Processes companies queued by users ("Discover contacts") plus a small daily batch of new ones. */
export async function processLeadDiscovery(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastDailyEnqueue !== today) {
    lastDailyEnqueue = today;
    await enqueueDaily().catch((e) => console.warn(JSON.stringify({ msg: "lead-daily-enqueue-failed", error: String(e).slice(0, 200) })));
  }

  const { data: rows, error } = await admin
    .from("discovered_companies")
    .select("id, organization_id, cin, company_name, website, website_status, registration_date, industry")
    .eq("discovery_status", "queued")
    .order("discovery_requested_at", { ascending: true })
    .limit(2);
  if (missingTables(error) || error || !rows?.length) return;

  for (const c of rows as CompanyRow[]) {
    const { data: claimed } = await admin.from("discovered_companies").update({ discovery_status: "running" }).eq("id", c.id).eq("discovery_status", "queued").select("id");
    if (!claimed?.length) continue;
    const job = await admin.from("lead_import_jobs").insert({ organization_id: c.organization_id, source_key: "website_discovery", kind: "contact_discovery", status: "running", message: c.company_name }).select("id").maybeSingle();
    try {
      const r = await discoverCompany(c);
      await admin.from("lead_import_jobs").update({
        status: r.website ? "success" : "skipped",
        fetched_count: r.emails + r.phones + r.people,
        inserted_count: r.emails + r.phones + r.people,
        message: r.website ? `${c.company_name}: ${r.people} people, ${r.emails} emails, ${r.phones} phones from ${r.website}` : `${c.company_name}: no website found`,
        finished_at: new Date().toISOString(),
      }).eq("id", job.data?.id ?? "");
      await touchSource(c.organization_id, "website_discovery", true, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A failed discovery never deletes previously stored data.
      await admin.from("discovered_companies").update({ discovery_status: "failed", discovery_error: msg.slice(0, 300) }).eq("id", c.id);
      await admin.from("lead_import_jobs").update({ status: "failed", failed_count: 1, message: msg.slice(0, 300), finished_at: new Date().toISOString() }).eq("id", job.data?.id ?? "");
      await touchSource(c.organization_id, "website_discovery", false, msg);
    }
  }
}

async function enqueueDaily() {
  const { data: sources, error } = await admin.from("lead_sources").select("organization_id, enabled, daily_limit, refresh_days").eq("source_key", "website_discovery");
  if (missingTables(error) || error) return;
  for (const s of sources ?? []) {
    if (!s.enabled || !s.daily_limit) continue;
    // Newest companies first; never re-check a company before its refresh interval.
    const cutoff = new Date(Date.now() - s.refresh_days * 86400000).toISOString();
    const { data: due } = await admin
      .from("discovered_companies")
      .select("id")
      .eq("organization_id", s.organization_id)
      .or(`discovery_status.eq.pending,and(discovery_status.in.(done,no_website,failed),discovered_at.lt.${cutoff})`)
      .order("registration_date", { ascending: false, nullsFirst: false })
      .limit(s.daily_limit);
    const ids = (due ?? []).map((r) => r.id);
    if (ids.length) await admin.from("discovered_companies").update({ discovery_status: "queued", discovery_requested_at: new Date().toISOString() }).in("id", ids);
  }
}

async function touchSource(org: string, key: string, ok: boolean, err: string | null) {
  const now = new Date().toISOString();
  await admin
    .from("lead_sources")
    .update(ok ? { status: "ok", last_run_at: now, last_success_at: now, last_error: null } : { status: "error", last_run_at: now, last_error: (err ?? "").slice(0, 300) })
    .eq("organization_id", org)
    .eq("source_key", key);
}

/* ------------------------- Optional data.gov.in import --------------------- */

const DATA_GOV_RESOURCE = "4dbe5667-7b6b-41d7-82af-211562424d9a";
let lastDataGovRun = "";

/** Runs once a day only when DATA_GOV_IN_API_KEY is configured; otherwise marks the source not configured. */
export async function processDataGovImport(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastDataGovRun === today) return;
  lastDataGovRun = today;
  const key = process.env.DATA_GOV_IN_API_KEY?.trim();
  const { data: sources, error } = await admin.from("lead_sources").select("organization_id, enabled").eq("source_key", "data_gov_in");
  if (missingTables(error) || error) return;
  for (const s of sources ?? []) {
    if (!key) {
      await admin.from("lead_sources").update({ status: "not_configured", last_run_at: new Date().toISOString(), last_error: null }).eq("organization_id", s.organization_id).eq("source_key", "data_gov_in");
      continue;
    }
    if (!s.enabled) continue;
    await importDataGov(s.organization_id, key).catch((e) => touchSource(s.organization_id, "data_gov_in", false, e instanceof Error ? e.message : String(e)));
  }
}

async function importDataGov(org: string, key: string) {
  const since = new Date(Date.now() - 183 * 86400000);
  const jobRes = await admin.from("lead_import_jobs").insert({ organization_id: org, source_key: "data_gov_in", kind: "company_import", status: "running" }).select("id").single();
  if (jobRes.error || !jobRes.data) throw new Error(jobRes.error?.message ?? "Could not create import job");
  const job = { data: jobRes.data };
  let offset = 0;
  let fetched = 0, inserted = 0, dup = 0, failed = 0;
  const errors: string[] = [];
  const map = {
    cin: "CIN", company_name: "CompanyName", registration_date: "CompanyRegistrationdate_date", company_status: "CompanyStatus",
    company_class: "CompanyClass", company_category: "CompanyCategory", state: "CompanyStateCode", registered_address: "Registered_Office_Address",
    nic_code: "nic_code", business_activity: "CompanyIndustrialClassification", authorized_capital: "AuthorizedCapital", paid_up_capital: "PaidupCapital",
  } as const;
  for (let page = 0; page < 200; page++) {
    const url = `https://api.data.gov.in/resource/${DATA_GOV_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=100&offset=${offset}&sort[CompanyRegistrationdate_date]=desc`;
    let body: { records?: Record<string, unknown>[]; updated_date?: string; error?: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (res?.ok) {
        body = await res.json().catch(() => null);
        break;
      }
      if (res && res.status < 500 && res.status !== 429) throw new Error(`data.gov.in HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 2 ** attempt * 2000)); // exponential backoff
    }
    if (!body?.records) throw new Error(body?.error || "data.gov.in returned no records");
    if (page === 0 && body.updated_date) {
      await admin.from("lead_sources").update({ source_updated_at: new Date(body.updated_date).toISOString() }).eq("organization_id", org).eq("source_key", "data_gov_in");
    }
    let olderThanWindow = false;
    const valid = [];
    for (const r of body.records) {
      fetched++;
      const n = normalizeCompanyRow(r, map);
      if (!n.ok) { failed++; if (errors.length < 50) errors.push(n.error); continue; }
      if (n.value.registration_date && new Date(n.value.registration_date) < since) { olderThanWindow = true; continue; }
      const s = scoreLead({ registrationDate: n.value.registration_date, hasWebsite: false, hasBusinessEmail: false, hasBusinessPhone: false, industry: n.value.industry });
      const { registered_email: _email, ...company } = n.value;
      valid.push({ ...company, organization_id: org, source_key: "data_gov_in", source_url: `https://www.data.gov.in/resource/${DATA_GOV_RESOURCE}`, import_job_id: job.data.id,
        lead_score: s.score, score_reasons: s.reasons, opportunities: suggestOpportunities(n.value.industry, false) });
    }
    if (valid.length) {
      const { data, error } = await admin.from("discovered_companies").upsert(valid, { onConflict: "organization_id,cin", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
      dup += valid.length - (data?.length ?? 0);
    }
    if (olderThanWindow || body.records.length < 100) break;
    offset += 100;
    await new Promise((r) => setTimeout(r, 1000)); // rate limit
  }
  await admin.from("lead_import_jobs").update({
    status: failed ? "partial" : "success", fetched_count: fetched, inserted_count: inserted, duplicate_count: dup, failed_count: failed,
    errors, finished_at: new Date().toISOString(),
  }).eq("id", job.data.id);
  await touchSource(org, "data_gov_in", true, null);
}

/* ---------------------------- Optional Hunter.io ---------------------------- */

let lastHunterRun = "";

/**
 * Hunter.io Domain Search, only when HUNTER_API_KEY is set AND the source is switched on.
 * Uses the free account endpoint (no credit) to read remaining credits first and stops at zero.
 * Stores only emails Hunter reports with at least one public source page (never pattern guesses).
 */
export async function processHunter(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastHunterRun === today) return;
  lastHunterRun = today;
  const key = process.env.HUNTER_API_KEY?.trim();
  const { data: sources, error } = await admin.from("lead_sources").select("organization_id, enabled, refresh_days").eq("source_key", "hunter");
  if (missingTables(error) || error) return;
  for (const s of sources ?? []) {
    if (!key) {
      await admin.from("lead_sources").update({ status: "not_configured", last_run_at: new Date().toISOString() }).eq("organization_id", s.organization_id).eq("source_key", "hunter");
      continue;
    }
    if (!s.enabled) continue;
    try {
      await runHunter(s.organization_id, key, s.refresh_days);
    } catch (e) {
      await touchSource(s.organization_id, "hunter", false, (e instanceof Error ? e.message : String(e)).replace(key, "***"));
    }
  }
}

async function runHunter(org: string, key: string, refreshDays: number) {
  const acct = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
  if (!acct.ok) throw new Error(`Hunter account check failed (HTTP ${acct.status})`);
  const a = (await acct.json()) as { data?: { requests?: { credits?: { used?: number; available?: number }; searches?: { used?: number; available?: number } } } };
  const pool = a.data?.requests?.credits ?? a.data?.requests?.searches ?? {};
  const remaining = Math.max(0, Number(pool.available ?? 0) - Number(pool.used ?? 0));
  await admin.from("lead_sources").update({ usage_month: new Date().toISOString().slice(0, 7), usage_count: Number(pool.used ?? 0), usage_limit: Number(pool.available ?? 0) })
    .eq("organization_id", org).eq("source_key", "hunter");
  if (remaining <= 0) {
    await touchSource(org, "hunter", false, "Free credits used up for this month; lookups paused until they reset.");
    return;
  }
  const cutoff = new Date(Date.now() - refreshDays * 86400000).toISOString();
  const { data: companies } = await admin
    .from("discovered_companies")
    .select("id, website, website_status")
    .eq("organization_id", org)
    .not("website", "is", null)
    .neq("website_status", "rejected")
    .or(`hunter_checked_at.is.null,hunter_checked_at.lt.${cutoff}`)
    .order("lead_score", { ascending: false })
    .limit(Math.min(remaining, 5)); // at most 5 per day so the monthly free pool lasts
  const job = await admin.from("lead_import_jobs").insert({ organization_id: org, source_key: "hunter", kind: "contact_discovery", status: "running" }).select("id").maybeSingle();
  let found = 0, checked = 0;
  for (const c of companies ?? []) {
    const domain = new URL(c.website!).hostname.replace(/^www\./, "");
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(20_000) });
    checked++;
    await admin.from("discovered_companies").update({ hunter_checked_at: new Date().toISOString() }).eq("id", c.id);
    if (res.status === 429) break;
    if (!res.ok) continue;
    const body = (await res.json()) as { data?: { emails?: { value: string; type?: string; first_name?: string | null; last_name?: string | null; position?: string | null; sources?: { uri?: string }[] }[] } };
    for (const e of body.data?.emails ?? []) {
      const src = e.sources?.find((x) => x.uri && /^https?:\/\//.test(x.uri))?.uri;
      if (!src) continue; // no public source = Hunter inferred it from a pattern: never stored
      const person = e.type === "personal" && e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : null;
      const roles = matchRoles(e.position);
      let dmId: string | null = null;
      if (person && roles.length) {
        const { data: existing } = await admin.from("decision_makers").select("id").eq("company_id", c.id).ilike("full_name", person.replace(/[%_]/g, "")).limit(1).maybeSingle();
        dmId = existing?.id ?? null;
        if (!dmId) {
          const conf = contactConfidence({ officialWebsite: false, exactNameAndDesignation: Boolean(e.position), businessEmail: true, businessPhone: false, matchingProfile: false });
          const ins = await admin.from("decision_makers").insert({
            organization_id: org, company_id: c.id, full_name: person, original_designation: e.position, roles, source_type: "api", source_url: src,
            verification_status: "unverified", confidence_score: conf.score, score_reasons: [...conf.reasons, { label: "Listed by Hunter.io with a public source", points: 0 }],
          }).select("id").maybeSingle();
          dmId = ins.data?.id ?? null;
        }
      }
      await saveContact(org, c.id, dmId, "email", e.value.toLowerCase(), dmId ? "person_professional" : e.type === "generic" ? "company_general" : "department", src);
      found++;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  await admin.from("lead_import_jobs").update({ status: "success", fetched_count: checked, inserted_count: found, message: `${checked} domains checked, ${found} sourced emails`, finished_at: new Date().toISOString() }).eq("id", job.data?.id ?? "");
  await touchSource(org, "hunter", true, null);
}
