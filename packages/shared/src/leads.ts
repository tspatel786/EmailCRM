// Lead Finder / Decision Maker Finder: pure, testable logic shared by the web app and worker.
// Nothing here guesses email addresses or phone numbers; it only parses and scores data that
// was actually published by a source.

/* ----------------------------------- CIN ----------------------------------- */

const CIN_RE = /^[LUF][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const LLPIN_RE = /^[A-Z]{3}-[0-9]{4}$/;

/** Upper-cases and strips spaces; returns null when it is not a valid CIN or LLPIN. */
export function normalizeCin(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).toUpperCase().replace(/\s+/g, "").trim();
  return CIN_RE.test(v) || LLPIN_RE.test(v) ? v : null;
}

export const CIN_STATE_CODES: Record<string, string> = {
  AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar",
  CH: "Chandigarh", CT: "Chhattisgarh", CG: "Chhattisgarh", DD: "Daman and Diu", DL: "Delhi", DN: "Dadra and Nagar Haveli",
  GA: "Goa", GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana", JH: "Jharkhand", JK: "Jammu and Kashmir",
  KA: "Karnataka", KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep", MH: "Maharashtra", ML: "Meghalaya", MN: "Manipur",
  MP: "Madhya Pradesh", MZ: "Mizoram", NL: "Nagaland", OR: "Odisha", OD: "Odisha", PB: "Punjab", PY: "Puducherry",
  RJ: "Rajasthan", SK: "Sikkim", TG: "Telangana", TS: "Telangana", TN: "Tamil Nadu", TR: "Tripura", UP: "Uttar Pradesh",
  UR: "Uttarakhand", UK: "Uttarakhand", WB: "West Bengal",
};

/** Information encoded in a CIN: listing, NIC activity code, state, year, company type. */
export function parseCin(cin: string): { listed: boolean; nic: string; state: string | null; year: number; type: string } | null {
  if (!CIN_RE.test(cin)) return null;
  return {
    listed: cin[0] === "L",
    nic: cin.slice(1, 6),
    state: CIN_STATE_CODES[cin.slice(6, 8)] ?? null,
    year: Number(cin.slice(8, 12)),
    type: cin.slice(12, 15),
  };
}

/* --------------------------------- Names ---------------------------------- */

const LEGAL_SUFFIXES = /\b(private|pvt|limited|ltd|llp|opc|one person company|company|co|india|incorporated|inc|corporation|corp|the|and|&)\b\.?/gi;

/** Lower-case company name without legal suffixes or punctuation (used for matching only). */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[().,'"/\\-]+/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------- Industries -------------------------------- */

export const INDUSTRIES = [
  "Information Technology", "Manufacturing", "Trading", "Wholesale & Distribution", "Construction & Real Estate",
  "Healthcare", "Education", "Hospitality", "Retail", "Logistics", "Finance & Professional Services", "Agriculture", "Other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** NIC 2008 division (first two digits) to a business industry. */
export function industryFromNic(nic?: string | null): Industry {
  const d = Number(String(nic ?? "").replace(/\D/g, "").slice(0, 2));
  if (!d) return "Other";
  if (d <= 3) return "Agriculture";
  if (d >= 10 && d <= 33) return "Manufacturing";
  if (d >= 41 && d <= 43) return "Construction & Real Estate";
  if (d === 68) return "Construction & Real Estate";
  if (d === 45) return "Trading";
  if (d === 46) return "Wholesale & Distribution";
  if (d === 47) return "Retail";
  if (d >= 49 && d <= 53) return "Logistics";
  if (d === 55 || d === 56) return "Hospitality";
  if (d >= 58 && d <= 63) return "Information Technology";
  if ((d >= 64 && d <= 66) || (d >= 69 && d <= 75)) return "Finance & Professional Services";
  if (d === 85) return "Education";
  if (d >= 86 && d <= 88) return "Healthcare";
  return "Other";
}

/** Keyword fallback when only a free-text business activity is available. */
export function industryFromText(text?: string | null): Industry {
  const t = (text ?? "").toLowerCase();
  const rules: [RegExp, Industry][] = [
    [/software|information technology|\bit\b|computer|digital|data process|web|app develop/, "Information Technology"],
    [/hospital|clinic|health|pharma|medical|diagnostic/, "Healthcare"],
    [/school|education|college|training|academy|coaching/, "Education"],
    [/construct|builder|real estate|infra|civil|developer/, "Construction & Real Estate"],
    [/hotel|restaurant|resort|catering|food service/, "Hospitality"],
    [/logistic|transport|courier|freight|warehous|shipping/, "Logistics"],
    [/retail|store|shop|supermarket|e-?commerce/, "Retail"],
    [/wholesale|distribut/, "Wholesale & Distribution"],
    [/trading|traders|import|export/, "Trading"],
    [/manufactur|industr|engineering|fabricat|plastic|chemical|textile|steel/, "Manufacturing"],
    [/agri|farm|dairy|poultry|seed|fertili/, "Agriculture"],
    [/finance|financial|consult|account|legal|advisor|insurance|capital/, "Finance & Professional Services"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "Other";
}

/** Suggested software services by industry (suggestions, never confirmed requirements). */
export const OPPORTUNITIES: Record<Industry, string[]> = {
  "Manufacturing": ["ERP", "Inventory Management", "Production Management", "Quality Management"],
  "Trading": ["Billing Software", "Inventory Management", "CRM"],
  "Wholesale & Distribution": ["Inventory Management", "Billing Software", "Distributor Management", "CRM"],
  "Construction & Real Estate": ["Project Management", "Contractor Management", "HRMS"],
  "Healthcare": ["Hospital Management", "Clinic Management"],
  "Education": ["School Management", "College Management"],
  "Hospitality": ["POS", "Booking System", "Inventory Management"],
  "Retail": ["POS", "Billing", "Inventory"],
  "Logistics": ["Fleet Management", "Shipment Tracking", "ERP"],
  "Finance & Professional Services": ["CRM", "Document Management", "HRMS"],
  "Information Technology": ["Website Development", "Mobile Application", "AI Solutions"],
  "Agriculture": ["Farm Management", "Inventory Management", "Mobile Application"],
  "Other": [],
};
const GENERAL_OPPORTUNITIES = ["CRM", "HRMS", "Website Development", "Mobile Application", "Custom Software"];

export function suggestOpportunities(industry: Industry, hasWebsite: boolean): string[] {
  const list = [...OPPORTUNITIES[industry]];
  if (!hasWebsite) list.unshift("Website Development");
  for (const g of GENERAL_OPPORTUNITIES) if (!list.includes(g)) list.push(g);
  return list.slice(0, 7);
}

/* ------------------------------- Lead score -------------------------------- */

export type ScoreReason = { label: string; points: number };
export type LeadScoreInput = {
  registrationDate?: string | null;
  hasWebsite: boolean;
  hasBusinessEmail: boolean;
  hasBusinessPhone: boolean;
  industry: Industry;
  now?: Date;
};

// Industries where we have a concrete software offering.
const RELEVANT: Industry[] = ["Manufacturing", "Trading", "Wholesale & Distribution", "Construction & Real Estate", "Healthcare", "Education", "Hospitality", "Retail", "Logistics"];

/** Explainable 0-100 score. Missing data never adds points. */
export function scoreLead(i: LeadScoreInput): { score: number; reasons: ScoreReason[]; category: "hot" | "warm" | "cold" } {
  const reasons: ScoreReason[] = [];
  const now = i.now ?? new Date();
  if (i.registrationDate) {
    const days = (now.getTime() - new Date(i.registrationDate).getTime()) / 86400000;
    if (days >= 0 && days <= 183) reasons.push({ label: "Registered in the last 6 months", points: 20 });
    else if (days > 183 && days <= 365) reasons.push({ label: "Registered in the last year", points: 10 });
  }
  if (i.hasWebsite) reasons.push({ label: "Official website found", points: 10 });
  if (i.hasBusinessEmail) reasons.push({ label: "Public business email found", points: 15 });
  if (i.hasBusinessPhone) reasons.push({ label: "Public business phone found", points: 15 });
  if (RELEVANT.includes(i.industry)) reasons.push({ label: `${i.industry}: matches our software services`, points: 15 });
  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  return { score, reasons, category: score >= 75 ? "hot" : score >= 45 ? "warm" : "cold" };
}

/* ------------------------------ Role matching ------------------------------ */

export const DM_ROLES = ["ceo", "founder", "managing_director", "director", "owner", "it_manager", "purchase_manager"] as const;
export type Role = (typeof DM_ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  ceo: "CEO", founder: "Founder", managing_director: "Managing Director", director: "Director",
  owner: "Owner", it_manager: "IT Manager", purchase_manager: "Purchase Manager",
};

const ROLE_PATTERNS: [Role, RegExp][] = [
  ["ceo", /\b(chief executive officer|c\.?e\.?o\.?)\b/i],
  ["founder", /\b(co-?founder|founder|founding partner)\b/i],
  ["managing_director", /\b(managing director|m\.?d\.?)\b/i],
  ["owner", /\b(owner|proprietor|proprietress)\b/i],
  ["it_manager", /\b(information technology manager|it manager|it head|head of it|head - it|technology manager|chief technology officer|c\.?t\.?o\.?|chief information officer|c\.?i\.?o\.?)\b/i],
  ["purchase_manager", /\b(purchase manager|procurement manager|head of procurement|purchase head|procurement head|purchase officer)\b/i],
];

/**
 * Normalized roles for a published designation. "Director" is matched only when it is not
 * "Managing Director", and a director is never assumed to be the CEO.
 */
export function matchRoles(designation?: string | null): Role[] {
  const d = (designation ?? "").trim();
  if (!d) return [];
  const roles = new Set<Role>();
  for (const [role, re] of ROLE_PATTERNS) if (re.test(d)) roles.add(role);
  const withoutMd = d.replace(/managing director/gi, "");
  if (/\b(director|whole[- ]time director|executive director)\b/i.test(withoutMd)) roles.add("director");
  return DM_ROLES.filter((r) => roles.has(r));
}

/* ------------------------- Email and phone extraction ---------------------- */

const GENERIC_LOCAL = /^(info|sales|contact|contactus|support|business|hello|hi|enquiry|enquiries|inquiry|admin|office|mail|accounts|account|hr|careers|jobs|marketing|help|service|services|team|care|customercare|customer\.care|connect|query|queries)$/i;
const FREE_MAIL = /^(gmail|yahoo|ymail|hotmail|outlook|live|rediffmail|rediff|aol|icloud|protonmail|zoho)\./i;
const BLOCKED_EMAIL = /(example\.(com|org|net)|sentry|wixpress|domain\.com|email\.com|yourdomain|\.(png|jpe?g|gif|webp|svg)$)/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}/g;

export type ExtractedEmail = { email: string; kind: "company_general" | "person_professional" | "department"; onCompanyDomain: boolean; freeMail: boolean };

export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".");
  const twoLevel = /\.(co|org|net|gov|ac|edu|firm|gen|ind)\.in$/.test(h);
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

/** Emails actually present in page text or mailto: links. Never constructs addresses. */
export function extractEmails(textOrHtml: string, companyHost?: string): ExtractedEmail[] {
  const decoded = textOrHtml.replace(/&#64;|&commat;|\s?\[at\]\s?|\s?\(at\)\s?/gi, "@").replace(/%40/g, "@");
  const found = new Map<string, ExtractedEmail>();
  const companyDomain = companyHost ? registrableDomain(companyHost) : null;
  for (const m of decoded.matchAll(EMAIL_RE)) {
    const email = m[0].replace(/^[.]+|[.]+$/g, "").toLowerCase();
    if (BLOCKED_EMAIL.test(email)) continue;
    const [local, domain] = email.split("@") as [string, string];
    if (!local || !domain) continue;
    const onCompanyDomain = Boolean(companyDomain && registrableDomain(domain) === companyDomain);
    const freeMail = FREE_MAIL.test(domain);
    const kind: ExtractedEmail["kind"] = GENERIC_LOCAL.test(local) || freeMail ? "company_general" : onCompanyDomain ? "person_professional" : "department";
    if (!found.has(email)) found.set(email, { email, kind, onCompanyDomain, freeMail });
  }
  return [...found.values()];
}

export type ExtractedPhone = { e164: string; display: string; kind: "company_general" | "company_switchboard" };

/** Indian phone numbers from tel: links and visible text (mobiles 6-9xxxxxxxxx, STD landlines). */
export function extractPhones(textOrHtml: string): ExtractedPhone[] {
  const out = new Map<string, ExtractedPhone>();
  const candidates: string[] = [];
  for (const m of textOrHtml.matchAll(/tel:([+\d\s().-]{8,20})/gi)) candidates.push(m[1]!);
  for (const m of textOrHtml.matchAll(/(?:\+91[\s.-]?|\b0)?(?:[6-9]\d{4}[\s.-]?\d{5}|\d{2,4}[\s.-]\d{6,8})\b/g)) candidates.push(m[0]);
  for (const raw of candidates) {
    let d = raw.replace(/[^\d+]/g, "");
    if (d.startsWith("+91")) d = d.slice(3);
    else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    let kind: ExtractedPhone["kind"] = "company_general";
    if (/^[6-9]\d{9}$/.test(d)) {
      // mobile
    } else if (/^0?[1-9]\d{9}$/.test(d)) {
      d = d.replace(/^0/, "");
      kind = "company_switchboard";
    } else continue;
    // Reject obvious non-phones (repeated digits, sequences).
    if (/^(\d)\1{9}$/.test(d) || d === "1234567890") continue;
    const e164 = `+91${d}`;
    if (!out.has(e164)) out.set(e164, { e164, display: kind === "company_general" ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : `+91 ${d}`, kind });
  }
  return [...out.values()];
}

/* ------------------------------ People on pages ---------------------------- */

const NAME_RE = /^(?:(?:mr|mrs|ms|dr|shri|smt|er|ca|prof)\.?\s+)?[A-Z][a-zA-Z'.-]{1,30}(?:\s+[A-Z][a-zA-Z'.-]{0,30}){1,3}$/;
const NOT_NAME = /\b(team|about|contact|our|company|services|privacy|policy|home|careers|leadership|management|board|meet|the|read more|view|profile|india|limited|pvt|private|director|manager|officer|founder|ceo|head)\b/i;

export type ExtractedPerson = { name: string; designation: string; roles: Role[] };

/** Visible text lines of an HTML page (scripts, styles and tags removed). */
export function htmlToLines(html: string): string[] {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|td|tr|span|a|strong|b|em|section|article|figcaption)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && l.length < 160);
}

function cleanName(s: string): string | null {
  const n = s.replace(/^[-–|:•·,\s]+|[-–|:•·,\s]+$/g, "").trim();
  if (n.length < 4 || n.length > 60 || !NAME_RE.test(n) || NOT_NAME.test(n)) return null;
  return n;
}

/**
 * People explicitly published with one of the target designations, e.g. "Asha Rao, Managing
 * Director" or a name line directly above/below a designation line. Returns nothing for a
 * designation without a clearly adjacent name.
 */
export function extractPeople(lines: string[]): ExtractedPerson[] {
  const out = new Map<string, ExtractedPerson>();
  const add = (name: string, designation: string) => {
    const roles = matchRoles(designation);
    if (!roles.length) return;
    const key = `${name.toLowerCase()}|${designation.toLowerCase()}`;
    if (!out.has(key)) out.set(key, { name, designation: designation.slice(0, 120), roles });
  };
  lines.forEach((line, i) => {
    if (!matchRoles(line).length) return;
    // Same line: "Name - Designation" / "Name, Designation" / "Designation: Name"
    const same = line.match(/^(.{2,60}?)\s*[,–\-|:]\s*(.{2,100})$/);
    if (same) {
      const left = cleanName(same[1]!);
      const right = cleanName(same[2]!);
      if (left && matchRoles(same[2]!).length) return add(left, same[2]!.trim());
      if (right && matchRoles(same[1]!).length) return add(right, same[1]!.trim());
    }
    if (line.length > 70) return;
    // Adjacent lines (team cards): name above or below the designation line.
    const prev = i > 0 ? cleanName(lines[i - 1]!) : null;
    const next = i + 1 < lines.length ? cleanName(lines[i + 1]!) : null;
    if (prev) add(prev, line);
    else if (next) add(next, line);
  });
  return [...out.values()];
}

/* ------------------------------ Confidence --------------------------------- */

export function contactConfidence(i: {
  officialWebsite: boolean;
  exactNameAndDesignation: boolean;
  businessEmail: boolean;
  businessPhone: boolean;
  matchingProfile: boolean;
}): { score: number; reasons: ScoreReason[]; level: "high" | "medium" | "low" } {
  const reasons: ScoreReason[] = [];
  if (i.officialWebsite) reasons.push({ label: "Found on the company's official website", points: 30 });
  if (i.exactNameAndDesignation) reasons.push({ label: "Name and designation published together", points: 25 });
  if (i.businessEmail) reasons.push({ label: "Business email from an official source", points: 20 });
  if (i.businessPhone) reasons.push({ label: "Business phone from an official source", points: 15 });
  if (i.matchingProfile) reasons.push({ label: "Matching public profile linked", points: 10 });
  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  return { score, reasons, level: score >= 80 ? "high" : score >= 50 ? "medium" : "low" };
}

/* ---------------------------- Website discovery ---------------------------- */

const STOP_TOKENS = new Set(["private", "limited", "pvt", "ltd", "llp", "opc", "india", "the", "and", "of", "co", "company", "services", "solutions", "enterprises", "industries", "international", "global", "group"]);

/** Significant words of a company name (used to verify that a website belongs to it). */
export function nameTokens(companyName: string): string[] {
  return normalizeCompanyName(companyName)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP_TOKENS.has(t));
}

/** Candidate domains to CHECK for a company website (verified by page content before use). */
export function candidateDomains(companyName: string): string[] {
  const full = normalizeCompanyName(companyName).split(" ").filter((t) => t && t !== "the");
  const sig = nameTokens(companyName);
  if (!sig.length) return [];
  const bases = new Set<string>();
  bases.add(full.join("").replace(/[^a-z0-9]/g, ""));
  bases.add(sig.join("").replace(/[^a-z0-9]/g, ""));
  if (sig.length > 1) bases.add(sig.join("-").replace(/[^a-z0-9-]/g, ""));
  const out: string[] = [];
  for (const b of bases) {
    if (b.length < 4 || b.length > 40) continue;
    for (const tld of ["com", "in", "co.in"]) out.push(`${b}.${tld}`);
  }
  return out.slice(0, 9);
}

/** A company-owned domain from its registered email (ignores Gmail/Yahoo etc.), to check as its website. */
export function websiteFromEmail(email?: string | null): string | null {
  const domain = (email ?? "").toLowerCase().split("@")[1];
  if (!domain || FREE_MAIL.test(domain) || !/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(domain)) return null;
  return registrableDomain(domain);
}

/** True when page text clearly refers to the company (CIN, or most of its significant name words). */
export function pageMatchesCompany(pageText: string, companyName: string, cin?: string | null): boolean {
  const t = pageText.toLowerCase();
  if (cin && t.includes(cin.toLowerCase())) return true;
  const tokens = nameTokens(companyName);
  if (!tokens.length) return false;
  const hits = tokens.filter((tok) => new RegExp(`\\b${tok.replace(/[^a-z0-9]/g, "")}\\b`).test(t)).length;
  return tokens.length === 1 ? hits === 1 && t.includes(normalizeCompanyName(companyName)) : hits >= Math.max(2, Math.ceil(tokens.length * 0.75));
}

/* ------------------------------ Manual links ------------------------------- */

export function manualSearchLinks(companyName: string, cin?: string | null, website?: string | null, personName?: string | null) {
  const q = encodeURIComponent;
  return {
    mca: "https://www.mca.gov.in/content/mca/global/en/mca/master-data/MDS.html",
    mcaHint: cin ? `Search CIN ${cin} under "View Company or LLP Master Data"` : "Search the company name under Master Data",
    linkedinCompany: `https://www.linkedin.com/search/results/companies/?keywords=${q(normalizeCompanyName(companyName))}`,
    linkedinPeople: `https://www.linkedin.com/search/results/people/?keywords=${q(`${personName ? `${personName} ` : ""}${normalizeCompanyName(companyName)}`)}`,
    webSearch: `https://www.google.com/search?q=${q(`"${companyName}"${cin ? ` OR "${cin}"` : ""}`)}`,
    website: website ?? null,
  };
}

/* --------------------------- MCA file column mapping ----------------------- */

export const LEAD_IMPORT_FIELDS = [
  "cin", "company_name", "registration_date", "company_status", "company_class", "company_category",
  "state", "city", "registered_address", "nic_code", "business_activity", "authorized_capital", "paid_up_capital",
  "registered_email",
] as const;
export type LeadImportField = (typeof LEAD_IMPORT_FIELDS)[number];

// Header names are compared after removing everything except letters and digits, so
// "DATE_OF_REGISTRATION", "Date of Registration" and "date-of-registration" all match. Includes the
// column names used by MCA's monthly "companies registered" files and the data.gov.in company
// master data (CSV and API).
const HEADER_KEYS: Record<LeadImportField, string[]> = {
  cin: ["cin", "corporateidentificationnumber", "companycin", "llpin", "cinllpin", "cinfcrn", "fcrn", "cinno", "cinnumber"],
  company_name: ["companyname", "nameofthecompany", "nameofcompany", "llpname", "companyllpname", "name"],
  registration_date: ["dateofregistration", "dateofincorporation", "incorporationdate", "registrationdate", "companyregistrationdatedate", "companyregistrationdate", "doi", "dor"],
  company_status: ["companystatus", "status", "llpstatus", "companystatusforefiling"],
  company_class: ["companyclass", "class", "classofcompany"],
  company_category: ["companycategory", "category", "categoryofcompany", "companytype", "typeofcompany"],
  state: ["state", "registeredstate", "companystatecode", "statename", "rocstate", "statecode"],
  city: ["city", "district", "registeredcity"],
  registered_address: ["registeredofficeaddress", "registeredaddress", "address", "registeredofficeaddressroa", "officeaddress"],
  nic_code: ["nic", "niccode", "industrialclass", "industrialclassification", "activitycode", "principalbusinessactivitycode", "mainactivitycode"],
  business_activity: ["principalbusinessactivityaspercin", "principalbusinessactivity", "businessactivity", "activitydescription", "companyindustrialclassification", "activity", "mainbusinessactivity"],
  authorized_capital: ["authorizedcapital", "authorisedcapital", "authorizedcap", "authorisedcap", "authorizedcapitalrs", "authorisedcapitalrs"],
  paid_up_capital: ["paidupcapital", "paidupcap", "paidupcapitalrs", "paidcapital"],
  registered_email: ["emailaddr", "email", "emailid", "emailaddress", "registeredemail", "companyemail", "emailofcompany"],
};
const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export function guessColumnMapping(headers: string[]): Partial<Record<LeadImportField, string>> {
  const map: Partial<Record<LeadImportField, string>> = {};
  const keyed = headers.map((h) => ({ h, k: headerKey(h) }));
  // Exact key matches first (most specific), field by field.
  for (const f of LEAD_IMPORT_FIELDS) {
    for (const want of HEADER_KEYS[f]) {
      const hit = keyed.find((x) => x.k === want && !Object.values(map).includes(x.h));
      if (hit) { map[f] = hit.h; break; }
    }
  }
  return map;
}

/** Excel serial numbers, dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd and "12-Oct-2026" to ISO yyyy-mm-dd. */
export function parseDateFlexible(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{4})$/);
  if (m) {
    const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (mon >= 0) return iso(+m[3]!, mon + 1, +m[1]!);
  }
  return null;
}
function iso(y: number, mo: number, d: number): string | null {
  if (y < 1850 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

export type NormalizedCompany = {
  cin: string;
  company_name: string;
  normalized_name: string;
  registration_date: string | null;
  company_status: string | null;
  company_class: string | null;
  company_category: string | null;
  state: string | null;
  city: string | null;
  registered_address: string | null;
  nic_code: string | null;
  business_activity: string | null;
  industry: Industry;
  authorized_capital: number | null;
  paid_up_capital: number | null;
  /** Email registered with MCA, when the file includes it (public government record). */
  registered_email: string | null;
};

/** Validates and normalizes one imported row. Returns an error message for rejected rows. */
export function normalizeCompanyRow(row: Record<string, unknown>, map: Partial<Record<LeadImportField, string>>): { ok: true; value: NormalizedCompany } | { ok: false; error: string } {
  const get = (f: LeadImportField) => {
    const col = map[f];
    const v = col ? row[col] : undefined;
    return v === null || v === undefined ? "" : String(v).trim();
  };
  const cin = normalizeCin(get("cin"));
  if (!cin) return { ok: false, error: `Invalid or missing CIN "${get("cin")}"` };
  const name = get("company_name").replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Missing company name" };
  if (name.length > 400) return { ok: false, error: "Company name too long" };
  const rawDate = map.registration_date ? row[map.registration_date] : null;
  const registration_date = parseDateFlexible(rawDate);
  if (rawDate && !registration_date) return { ok: false, error: `Unreadable registration date "${String(rawDate)}"` };
  const parsed = parseCin(cin);
  const nic = get("nic_code").replace(/\D/g, "") || parsed?.nic || null;
  const stateRaw = get("state");
  const state = (stateRaw.length === 2 ? CIN_STATE_CODES[stateRaw.toUpperCase()] : stateRaw) || parsed?.state || null;
  const money = (f: LeadImportField) => {
    const n = Number(get(f).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && get(f) !== "" ? n : null;
  };
  const activity = get("business_activity") || null;
  const industry = nic ? industryFromNic(nic) : industryFromText(activity);
  return {
    ok: true,
    value: {
      cin,
      company_name: name,
      normalized_name: normalizeCompanyName(name),
      registration_date,
      company_status: get("company_status") || null,
      company_class: get("company_class") || null,
      company_category: get("company_category") || null,
      state,
      city: get("city") || null,
      registered_address: get("registered_address") || null,
      nic_code: nic,
      business_activity: activity,
      industry: industry === "Other" && activity ? industryFromText(activity) : industry,
      authorized_capital: money("authorized_capital"),
      paid_up_capital: money("paid_up_capital"),
      registered_email: /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(get("registered_email")) ? get("registered_email").toLowerCase() : null,
    },
  };
}
