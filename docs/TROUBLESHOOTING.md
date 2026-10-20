# Troubleshooting

## Frontend shows empty dashboard

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing (rebuild after changing Vite env)
- User has no `memberships` with `status = active`
- RLS blocking: confirm the user is in the selected org

## “This account has no organization membership”

Invite the user from Team, or run `npm run seed` locally. Production bootstrap requires `BOOTSTRAP_SECRET` on `organization-bootstrap`.

## Invite fails

- Function not deployed / CORS
- Public signup disabled is expected; invites use the service role
- Admin cannot invite `owner`

## Campaigns stay draft

Queue requires owner/admin/sales_manager and confirmation. Viewers are forbidden (403).

## Jobs queued but nothing sends

- Worker not running
- `SMTP_MOCK=false` without credentials
- Campaign still `scheduled` in the future (`next_attempt_at`)
- Daily limit reached (jobs defer to next UTC day)
- Campaign `paused` or `cancelled`

## Duplicate emails

SMTP is at-least-once. Idempotency is `(campaign_id, contact_id)`. Do not re-queue a completed campaign. Inspect `ambiguous_smtp_outcome_after_worker_crash` before manual retry.

## Import unique violation

An active contact in the same org already has that email. The importer updates that row instead of inserting a second one.

## Password reset link lands on login

Add `https://<domain>/reset-password` to Auth redirect URLs.
