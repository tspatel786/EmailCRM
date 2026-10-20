# Security checklist

- [ ] No `service_role` or SMTP password in `apps/web` or any `VITE_*` variable
- [ ] `npm run check:secrets` run against `apps/web/src` and production `dist`
- [ ] Public signup disabled; first owner created via seed or `BOOTSTRAP_SECRET` then secret rotated
- [ ] RLS enabled on all tenant tables (see migrations `0008_rls.sql`)
- [ ] `claim_email_jobs` / `increment_org_email_stat` execute revoked from `authenticated`/`anon`
- [ ] Membership helpers are `SECURITY DEFINER` with `search_path = public` and only use `auth.uid()`
- [ ] Campaign queueing checks role + consent + suppressions on the server
- [ ] Viewers cannot insert campaigns (RLS + UI)
- [ ] Storage paths prefixed with `organization_id`; MIME and 20 MiB limit
- [ ] HTML templates sanitized (DOMPurify client, `sanitize-html` worker)
- [ ] Audit logs for invites, bootstrap, campaign queue, org settings
- [ ] MFA enrolled for owner/admin
- [ ] Production Auth redirect allow-list locked to company domain
- [ ] Worker logs do not print message bodies or passwords
- [ ] Dependencies reviewed (`npm audit`); SheetJS license reviewed
- [ ] Cross-org RLS test executed against staging (`npm run test:rls`)

Unresolved critical issues must block production launch.
