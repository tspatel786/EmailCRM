# Backup and restore runbook

Renewing a hosting subscription does **not** mean unlimited retention. You must know the provider’s backup window, storage quota, and who is responsible for restore tests.

## What Supabase retains

Supabase paid plans include automated daily backups with a retention window that depends on the plan (often 7 days on Pro; confirm in the current dashboard). Point-in-time recovery (PITR) is a paid add-on. Free-tier projects may have **no** usable backup SLA.

Storage objects (attachments) are not fully covered by a SQL dump. Export the `org-documents` bucket separately.

## Independent export (company-controlled)

Weekly (or daily) from a trusted operator machine:

```bash
pg_dump "$SUPABASE_DB_URL" --format=custom --file="crm-$(date +%F).dump"
npx supabase storage ls --experimental   # or dashboard download
```

Store dumps encrypted off-platform (company object storage or offline). Database dumps contain personal data and email content — treat them as confidential.

Application-level Excel exports (Contacts, Reports, campaign results) are **not** a substitute for `pg_dump`.

## Restore drill (document the date you last succeeded)

1. Provision a **non-production** Supabase project or local `supabase start`.
2. `npx supabase db reset` then `pg_restore --clean --if-exists --no-owner --dbname "$TARGET_DB_URL" crm-YYYY-MM-DD.dump`  
   or restore via the dashboard backup UI onto a staging project.
3. Confirm:
   - RLS still enabled (`rowsecurity` true on tenant tables)
   - Demo/other-org users still cannot see each other’s contacts
   - A sample attachment downloads
   - Worker can claim a **queued** mock job
4. Record the drill date in your ops log. A restore that has never been tested is not a backup.

## After a production incident

1. Freeze worker (`SMTP_MOCK` or stop process) to avoid duplicate sends during restore.
2. Restore to staging first; verify campaign job statuses.
3. Only then promote or restore production with change control.
4. Jobs in `processing` at crash time may be `failed` / ambiguous — inspect before re-queueing.
