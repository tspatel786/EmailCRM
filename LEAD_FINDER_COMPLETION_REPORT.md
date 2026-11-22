# Lead Finder + Decision Maker Finder – Completion Report

Date: 22 Nov 2026 · Mode: zero API keys / zero external credentials

## 1. Existing features reused (nothing duplicated)

Login, organizations and roles; Team page; Contacts, Companies, Deals pipeline, Follow-ups (via CRM contacts); Excel export helpers (`lib/export.ts`); Excel/CSV parsing; UI kit; the persistent Render worker (used instead of a separate GitHub Actions ingestion job, because it already holds the database credentials and runs continuously); RLS model.

## 2. New modules

| Area | Where |
| --- | --- |
| Lead Finder – New Companies (dashboard cards, table, filters, pagination, bulk select, Save to CRM, Excel reports) | `apps/web/src/pages/LeadFinder.tsx` |
| MCA Excel/CSV import (drag-and-drop, column mapping, preview, validation, CIN duplicates, 6-month window, rejected-rows download, history) | same page, "Import MCA file" tab |
| Sources & history (connector registry, on/off, daily limit, status, limitations, run history) | same page, "Sources & history" tab |
| Company details (overview, score reasons, suggested opportunities, website confirm/edit/reject, contacts, manual MCA / LinkedIn / web links, decision makers, change history, Save to CRM / pipeline) | `apps/web/src/components/leads/CompanyDrawer.tsx` |
| Decision Maker Finder (role tabs, filters, Excel reports with 9 sheets, email/call links, LinkedIn) | `apps/web/src/pages/DecisionMakers.tsx` |
| Save to CRM (reuses existing company/contact by name/email, optional deal, timeline note, consent "unknown") | `apps/web/src/lib/leadCrm.ts` |
| Per-user permission switch | Team page (`Lead Finder access`), session flag, sidebar |
| Shared logic: CIN validation/parsing, name normalization, NIC→industry, opportunities, explainable lead score, 7-role matching, email/phone/people extraction, confidence score, website candidate checks, MCA column mapping, date parsing | `packages/shared/src/leads.ts` |
| Worker jobs: website contact discovery queue, daily batch, optional data.gov.in import | `worker/src/lead-discovery.ts` |

## 3. Database

Migrations `0028_lead_finder.sql` and `0029_lead_finder_charts_hunter.sql` – **both applied to production** (rollbacks in `supabase/rollback/`). 0029 adds `hunter_checked_at` (credits never spent twice on one company) and the `lead_finder_breakdown` chart view (RLS-aware; tested: a member without access sees nothing).

Tables: `discovered_companies` (unique CIN per org), `decision_makers` (multiple per company; same name + same designation = duplicate, different designation kept apart), `lead_contacts` (unique per company + type + value, contact kind and source URL on every row), `lead_sources`, `lead_import_jobs`, `lead_field_history`; view `lead_finder_stats`; column `memberships.lead_finder_access`; function `has_lead_finder_access`.

## 4. Data sources

| Status | Source | Notes |
| --- | --- | --- |
| **Fully working** | MCA monthly Excel/CSV upload | You download the official file in a browser and upload it; app validates and imports. |
| **Fully working** | Company website contact discovery | Tested live on smpatelithub.in: found `info@smpatelithub.in` and `+91 91124 27821` with source URL, scored the lead. Respects robots.txt, max 6 pages per company, polite delays, private-IP blocking, refresh every 30 days. |
| **Fully working** | MCA registered email | When the uploaded file has an email column (e.g. `EMAIL_ADDR`), it is stored as the company's contact ("publicly listed", source MCA) and a company-owned email domain becomes the website to check. Gmail/Yahoo etc. are never treated as a website. |
| **Fully working** | Website auto-matching | 1) domain of the MCA-registered email, used only if it loads; 2) name-based domains (.com/.in/.co.in), accepted only when the page names the company or shows its CIN. Shown as "auto-matched, please confirm" (confirmed automatically when the page shows the CIN). Companies without any website stay "Not available". |
| **Optional / not configured** | data.gov.in API | Code ready; runs only if `DATA_GOV_IN_API_KEY` is set on the worker. **Not tested with real data** (no key; the public sample key is rate-limited). |
| **Code complete, not configured** | Hunter.io | Connector implemented: runs only with `HUNTER_API_KEY` and the source switched on; reads remaining credits first (free call), max 5 domains/day, stops at zero, stores only emails Hunter lists with a public source page (never pattern guesses), never re-checks a company within the refresh interval. **Not tested** (no key). |
| **Manual only** | MCA director/signatory data | CAPTCHA + anti-bot ("Access Denied" to automated requests). "Search on MCA" link + Add decision maker form with required source URL. |
| **Manual only** | LinkedIn | Automated extraction not permitted. Company/people search links + profile URL field. |
| **Not available** | Automatic daily list of newly incorporated companies without credentials | data.gov.in needs a key; MCA blocks automated downloads. |

## 5. Permissions (enforced in the database)

Owner/admin always; other members only when switched on in Team. Viewer with access is read-only. 29 SQL tests in `scripts/sql-tests/lead_finder_test.sql` (rolled back) – **29/29 passed on production**, including: no access → zero rows and insert rejected, cannot grant self access, owner grants access, viewer read-only, other organization isolated, duplicate CIN/contact/person rejected, invalid CIN and LinkedIn URLs rejected, corrections recorded in history. Anonymous access check now covers 34 tables – all denied.

## 6. Tests

- Unit tests (`packages/shared/tests/leads.test.mjs`): 12 suites – CIN, names, industries, opportunities, lead score, all 7 roles, email/phone/people extraction, confidence, website matching, MCA mapping/dates/row validation. `npm run test:inquiry`: 22/22 pass (includes official MCA column names and email-domain website detection).
- Live discovery on a real website (temporary record, deleted afterwards).
- Save to CRM end-to-end (temporary records, deleted afterwards): 7/7 – company created once, general email/phone, consent unknown, person as separate contact, single deal, re-save reuses contact, status "In pipeline".
- Typecheck, production build, secret scan: pass.

## 7. Remaining / limitations

- New companies arrive when you upload the MCA monthly file (or automatically if a data.gov.in key is ever added).
- Decision makers are found automatically only when a company's own website publishes names with designations; otherwise use the manual links.
- Website discovery capacity: about 2 companies per minute, daily batch default 40 (adjustable on the Sources tab, max 500).
- Charts added: registration month, imports per day, top states, industries (Lead Finder); roles and contact availability (Decision Makers); Lead Finder tiles on the main Dashboard for permitted users.
- MCA file import now recognises the official column names (`CORPORATE_IDENTIFICATION_NUMBER`, `REGISTERED_STATE`, `AUTHORIZED_CAP`, `PAIDUP_CAPITAL`, `INDUSTRIAL_CLASS`, `PRINCIPAL_BUSINESS_ACTIVITY_AS_PER_CIN`, `EMAIL_ADDR`, and the data.gov.in API names), unit-tested.
- Not implemented by design: a generic "add any API endpoint" editor. It would need storing third-party credentials, which zero-credential mode excludes; each real source has its own connector instead.
- Still not possible without credentials: automatic import from data.gov.in (needs a free key), live test of Hunter and data.gov.in connectors.
