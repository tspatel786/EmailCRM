# IT Services CRM & Email Automation

Production-oriented, multi-tenant CRM for an IT services company: leads and clients, Excel/CSV import, Zoho SMTP campaigns, manual call logging, follow-ups, pipeline, quotations, meetings, projects, reporting, and long-term communication history.

This is a working full-stack system, not a UI mock. Dashboard numbers come from PostgreSQL through Supabase with Row Level Security.

## Repository layout

```
apps/web                 React + Vite + TypeScript frontend
packages/shared          Zod schemas, permissions, import mapping, queue helpers
worker                   Persistent Node.js SMTP + reminder worker
supabase/migrations      Schema, RLS, storage, grants
supabase/functions       invite-member, queue-campaign, unsubscribe, organization-bootstrap
docs                     Architecture, operations, security, backups
scripts                  Secret scan and optional live RLS checks
```

## Technology (pinned ranges)

| Layer | Packages |
| --- | --- |
| Frontend | React 18.3, Vite 5.4, TypeScript 5.7 (`strict`), React Router 6, Tailwind 3.4, React Hook Form 7, Zod 3, TanStack Query 5, Recharts 2, SheetJS `xlsx` 0.18, DOMPurify 3 |
| Backend | Supabase PostgreSQL 15 (CLI local), Auth, Storage, Edge Functions (Deno), RLS |
| Worker | Node.js 20+, Nodemailer 6, `@supabase/supabase-js` 2.47 |

Version-sensitive notes:

- Local `supabase/config.toml` targets Postgres **15**. Cloud projects on 15 or 17 are fine if you apply the same migrations.
- Auth signup is **disabled** in `config.toml`. Users join by invite (or local seed).
- `xlsx` is the SheetJS community build requested for Excel import/export. Review its license before commercial redistribution.
- Edge Functions import `@supabase/supabase-js@2.47.10` from `esm.sh`. Pin that version when deploying.

## What is implemented

- Invite-only authentication, password reset, optional TOTP MFA, org memberships, five roles
- Tenant isolation via RLS on every tenant table
- CRM companies/contacts with duplicate email protection, import preview, batch history, export
- Client profile with tabs and an append-only activity timeline (lead → customer keeps history)
- Manual call logging and `tel:` click-to-call (duration is **not** auto-captured)
- Tasks/follow-ups with overdue derivation, calendar/list views, worker-side reminders, daily/weekly recurrence
- Templates, consent-aware campaign queueing, durable `email_jobs`, pause/cancel, unsubscribe
- Persistent worker: `FOR UPDATE SKIP LOCKED` claim, lease, backoff, daily limits, mock SMTP
- Pipeline kanban, versioned quotations, optional browser print-to-PDF, meetings, projects on win
- Reports and Excel exports scoped by RLS
- Audit logs for invites, org updates, and campaign queueing

## What is intentionally not claimed

- SMTP `250` = **accepted by Zoho**, not inbox delivery
- Exactly-once email delivery (SMTP is at-least-once; see worker reconciliation)
- Browser click-to-call recording or automatic duration
- Two-way calendar sync (`meetings.calendar_sync_status` stays `not_configured`)
- Call recordings
- Public self-registration as administrator

## Quick start (local)

1. Install Node.js 20+ and [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Copy `.env.example` to `.env`. After `supabase start`, paste the **anon** key into `VITE_SUPABASE_*` and `SUPABASE_ANON_KEY`, and the **service_role** key into `SUPABASE_SERVICE_ROLE_KEY` (worker/seed only).
3. Keep `SMTP_MOCK=true` until Zoho is configured.
4. From the repo root:

```bash
npx supabase start
npx supabase db reset
npm install
npm run seed
npm run dev
npm run dev:worker
```

5. Open http://localhost:5173 and sign in as `owner@demo.local` / `DemoPass123!`.

Full instructions: [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md).

## Tests

```bash
npm test
npm run check:secrets
```

Live RLS isolation (`npm run test:rls`) requires a running local stack and seed. It is skipped if `.env` still contains placeholder keys. Do not treat a skip as a pass against production.

## Secrets

Never put `SUPABASE_SERVICE_ROLE_KEY`, Zoho app passwords, or `BOOTSTRAP_SECRET` in `apps/web` or any `VITE_*` variable. The frontend may only use the anon key.

## Documentation map

| Document | Topic |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Tables and rules |
| [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) | Developer setup |
| [docs/SUPABASE_DEPLOY.md](docs/SUPABASE_DEPLOY.md) | Cloud database, Auth, functions |
| [docs/FRONTEND_HOSTING.md](docs/FRONTEND_HOSTING.md) | Static host + custom domain |
| [docs/WORKER_DEPLOY.md](docs/WORKER_DEPLOY.md) | SMTP worker process |
| [docs/ZOHO_SMTP.md](docs/ZOHO_SMTP.md) | Zoho app password |
| [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) | Backups and restore drill |
| [docs/YEARLY_HOSTING.md](docs/YEARLY_HOSTING.md) | Domain/hosting renewals |
| [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md) | Security review |
| [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) | Production launch |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures |
