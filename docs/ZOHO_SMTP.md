# Zoho Mail SMTP

1. Sign in to the company Zoho Mail account.
2. Enable 2FA if Zoho requires it for app passwords.
3. Create an **app-specific password** for SMTP. Store it only in the worker environment as `SMTP_PASS`.
4. Typical settings:

| Setting | Value |
| --- | --- |
| Host | `smtp.zoho.com` (or `smtp.zoho.in` for Indian data center) |
| Port | `465` with `SMTP_SECURE=true`, or `587` with STARTTLS (`SMTP_SECURE=false`) |
| User | full mailbox address |
| From | same domain mailbox (`SMTP_FROM_EMAIL`) |

5. Keep `SMTP_MOCK=true` in development. Use a dedicated test mailbox before production.
6. Daily org limit defaults to 100 (`organizations.daily_email_limit`). Zoho also enforces provider limits; remaining quota is not visible through SMTP.
7. Acceptance (`250`) is recorded as job status `sent` / event `smtp_accepted`. Bounces require Zoho notifications or a future inbound parser; they are not assumed.

Never log `SMTP_PASS`. The worker redacts it from error strings.
