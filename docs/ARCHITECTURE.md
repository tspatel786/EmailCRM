# Architecture — IT Services CRM & Email Automation

## Purpose

Multi-tenant CRM for an IT services company: leads and clients, Excel/CSV import, Zoho SMTP campaigns, manual call logging, follow-ups, pipeline, quotations, meetings, projects, reporting, and long-term communication history.

This is a full-stack system: React/TypeScript frontend, Supabase (PostgreSQL, Auth, Storage, Edge Functions), and a persistent Node.js worker for SMTP and reminders.

## High-level diagram

```
[Browser React app]
        |  HTTPS + JWT (anon key only)
        v
[Supabase API] ---- RLS ----> [PostgreSQL]
        |                         ^
        |                         | service role (server only)
        +--> Auth / Storage       |
        +--> Edge Functions ------+
                                  |
                         [Node SMTP/reminder worker]
                                  |
                         [Zoho Mail SMTP]
```

Secrets (Zoho app password, service-role key, unsubscribe HMAC secret) exist only in worker/Edge Function environment variables.

## Tenancy and roles

Every tenant-owned row has `organization_id`. Isolation is enforced by PostgreSQL RLS using the caller’s active `memberships` row.

Roles (highest privilege first):

| Role | Typical capabilities |
| --- | --- |
| `owner` | Full control, billing/settings, destroy org data, invite any role |
| `admin` | Manage team (not owner), settings, all CRM/email/reports |
| `sales_manager` | All sales data, assign work, send campaigns, reports |
| `sales_executive` | Own/assigned records, log calls, send assigned campaigns if granted |
| `viewer` | Read-only within the organization |

Public self-registration as administrator is not allowed. Users receive memberships through invitation. Local/demo bootstrap uses a seed script with the service role.

## Frontend

- Vite + React + TypeScript (`strict`)
- React Router for app shells and deep links
- TanStack Query for server state
- React Hook Form + Zod for forms
- Tailwind CSS for the visual system
- Recharts for analytics
- SheetJS (`xlsx`) for Excel import/export
- DOMPurify for HTML template sanitization in the browser (server also sanitizes)

The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Backend

### PostgreSQL

Normalized schema with UUID keys, foreign keys, partial unique indexes (duplicate emails), check constraints, and `updated_at` triggers. See `docs/DATA_MODEL.md`.

### Auth

Supabase Auth email/password, password recovery, invite-only users, optional TOTP MFA for privileged roles. Session is stored by the Supabase JS client.

### Edge Functions

| Function | Why it exists |
| --- | --- |
| `invite-member` | Service-role invite; cannot be done safely from the browser |
| `queue-campaign` | Consent checks, job fan-out in a transaction |
| `unsubscribe` | Public token endpoint; no session required |
| `organization-bootstrap` | Creates the first organization for a freshly invited owner (or local seed) |

Privileged functions use `security definer` only where required, with `search_path` pinned to `public`, `REVOKE` from `PUBLIC`, and grants limited to `service_role` or authenticated callers after membership checks.

### Worker

A long-running Node.js process:

1. Claims `email_jobs` with `FOR UPDATE SKIP LOCKED` and a lease
2. Sends via Nodemailer (or mock SMTP in development)
3. Records `email_events` (queued, processing, smtp_accepted, failed, bounced)
4. Releases/retries with exponential backoff + jitter
5. Enforces per-organization daily send limits
6. Materializes due reminders into `notifications`
7. Exposes `/health` for process monitoring

SMTP `250` means the server **accepted** the message, not that it reached the inbox. Status `sent` in this product means **SMTP accepted**. Delivery/bounce is recorded only when evidence exists (DSN/webhook or operator import). Exactly-once delivery is not possible over SMTP; the worker is at-least-once with idempotency keys to reduce duplicates.

## Activity timeline

`activities` is a thin projection: type, actor, summary, timestamps, and `source_table`/`source_id`. Source records remain canonical. Converting a lead to a customer updates `contacts.lifecycle` and may create a `projects`/`deals` row; it does **not** rewrite or delete history.

## Scheduling

- Campaign `scheduled_at` and job `scheduled_at` live in UTC
- Organization `timezone` is used for “today” dashboards and reminder local presentation
- Browser timers are UI convenience only; sending and reminders run in the worker

## Storage

Bucket `org-documents` with org-prefixed paths. Uploads validate size/MIME in the client and via storage policies. Downloads use authenticated access or signed URLs for time-limited sharing.

## Environments

| Env | Frontend | API | Worker |
| --- | --- | --- | --- |
| Local | Vite `:5173` | Supabase CLI | `npm run dev:worker` |
| Production | Static host + custom domain | Supabase project | VM/container with restart policy |

Never mix production service-role keys into local `.env` committed files.

## Out of scope (honest)

- Automatic call duration/recording from `tel:` links
- Cloud telephony (Twilio/etc.) — schema reserved via `calls.external_provider`
- Guaranteed inbox delivery or open/click tracking without a ESP that provides it
- Calendar two-way sync until a provider is implemented (`meetings.calendar_sync_status` stays `not_configured`)
- Call recording storage
