# Supabase deployment

1. Create **separate** projects for development and production.
2. Link production: `npx supabase link --project-ref <ref>`
3. Push schema: `npx supabase db push`
4. Deploy functions:

```bash
npx supabase functions deploy invite-member
npx supabase functions deploy queue-campaign
npx supabase functions deploy unsubscribe
npx supabase functions deploy organization-bootstrap
```

5. Set function secrets (dashboard or CLI), never in the frontend:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (usually auto-injected)
- `BOOTSTRAP_SECRET` — long random string; omit or rotate after the first owner exists

6. Auth settings (production):

- Disable public signup
- Site URL = `https://crm.example.com`
- Redirect URLs include `/reset-password`
- Enable email confirmations for invites
- Enable TOTP MFA

7. Storage: migration `0009_storage.sql` creates bucket `org-documents` (20 MiB, non-public).

8. Cron: email sending is the **Node worker**, not an HTTP Edge Function hold-open. Optionally schedule a health ping, but do not send campaigns from cron HTTP.

Do not apply schema changes only in the SQL editor. Add a numbered file under `supabase/migrations`.
