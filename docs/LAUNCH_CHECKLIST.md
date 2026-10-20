# Production launch checklist

- [ ] Separate Supabase projects for staging and production
- [ ] Migrations applied with `db push` (not dashboard-only edits)
- [ ] `.env` production secrets in the host/worker secret store only
- [ ] `SMTP_MOCK=false` only after a Zoho test send to an internal mailbox
- [ ] Custom domain HTTPS live; Auth site URL matches
- [ ] Worker health endpoint monitored; process restart policy on
- [ ] Daily email limit set on the organization row
- [ ] Invite one owner, one admin, one viewer; confirm viewer cannot queue campaigns
- [ ] Import a small CSV; confirm duplicate email blocked
- [ ] Queue a consenting-recipient campaign of 1–2 people; confirm unknown-consent skipped
- [ ] Unsubscribe link withdraws consent
- [ ] Backup restore drill completed on staging ([BACKUP_RESTORE.md](BACKUP_RESTORE.md))
- [ ] Error monitoring on frontend host + worker logs
- [ ] Legal: privacy notice, marketing consent language, retention days on `organizations.retention_days`

Do not launch if RLS tests are skipped on staging or if the service role is in the frontend bundle.
