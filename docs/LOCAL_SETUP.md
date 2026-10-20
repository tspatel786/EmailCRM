# Local setup

## Prerequisites

- Node.js 20.11 or later
- npm 10+
- Docker (required by Supabase CLI)
- Supabase CLI v1.200+ (`npx supabase` is enough)

## Environment variables

Copy `.env.example` to `.env` at the repository root. Vite loads this file because `apps/web/vite.config.ts` sets `envDir` to the repo root.

| Variable | Where used | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser | No (project URL) |
| `VITE_SUPABASE_ANON_KEY` | Browser | Public anon JWT only |
| `SUPABASE_URL` | Worker, seed, functions | No |
| `SUPABASE_ANON_KEY` | RLS test script | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker, seed, Edge Functions | **Yes — never in Vite** |
| `SUPABASE_DB_URL` | `psql`, backups | **Yes** |
| `SMTP_*` | Worker | **Yes** (`SMTP_PASS`) |
| `SMTP_MOCK` | Worker | Use `true` locally |
| `BOOTSTRAP_SECRET` | `organization-bootstrap` function | **Yes**, optional |
| `DEMO_PASSWORD` | Seed | Local only |

After `npx supabase start`, run `npx supabase status` and copy the API URL, anon key, and service_role key into `.env`.

## Commands

```bash
npx supabase start
npx supabase db reset          # applies supabase/migrations
npm install
npm run seed                   # creates demo users and two orgs
npm run dev                    # http://localhost:5173
npm run dev:worker             # mock SMTP + reminders
npm test
npm run typecheck
npm run check:secrets
```

Auth confirmations are disabled locally. Production should enable confirmations and invite-only signup.

## Demo users (after seed)

Password: `DemoPass123!` unless `DEMO_PASSWORD` is set.

- `owner@demo.local` — owner of Acme IT
- `manager@demo.local` — sales manager
- `exec@demo.local` — sales executive
- `viewer@demo.local` — read-only
- `other@demo.local` — owner of a **second** organization (RLS isolation)

Public registration as admin is disabled (`enable_signup = false`).

## Edge Functions locally

```bash
npx supabase functions serve
```

The web app calls `queue-campaign` and `invite-member` with the user JWT. Unsubscribe is public (`verify_jwt = false`).
