# Public Inquiry Form (`/inquiry/:orgSlug`)

Shareable, unauthenticated lead-capture form designed for WhatsApp links, social media bios, and printed/digital QR codes.

## Shareable Link Format

```text
https://<your-frontend-domain>/inquiry/<orgSlug>
```

Example for S.M.Patel IT Hub (`slug = smpatel-it-hub`):

```text
https://sales.smpatelithub.in/inquiry/smpatel-it-hub
```

- `orgSlug` resolves against `organizations.slug` on the server inside the `submit-inquiry` Edge Function.
- Invalid or unknown slugs return a generic error without exposing tenant details.
- The public page renders only the inquiry form and thank-you state (no CRM navigation, data, or login links).
- Default language is **Marathi** with an inline **English** toggle.

## QR Code Generation

You can generate a QR code pointing directly to `https://<your-frontend-domain>/inquiry/<orgSlug>`:

- Using any standard QR generator (or `npx qrcode -o inquiry-qr.png "https://sales.smpatelithub.in/inquiry/smpatel-it-hub"`).
- Always encode the full `https://` URL including your organization's exact `slug`.
- Verify the scanned URL opens the Marathi inquiry form without asking for login.

## Database Migration

Apply migration `supabase/migrations/0015_public_inquiry.sql`:

```bash
npx supabase db push
```

What it adds:

- `contacts.consent_text` (nullable `text`) to store the consent wording accepted during submission alongside `consent_captured_at`.
- Partial index `contacts_org_phone_idx` for fast mobile duplicate detection.
- `public.inquiry_rate_limits` table (`service_role` only, RLS denying `anon` and `authenticated`) and `public.consume_inquiry_rate_limit(...)` function enforcing max 5 submissions/hour per IP and per mobile.

## Edge Function Deployment (`submit-inquiry`)

- `submit-inquiry` generates a server-signed, single-use math CAPTCHA (`GET /functions/v1/submit-inquiry`), validates input with the shared Zod schema (`packages/shared/src/inquiry.ts`), checks the honeypot field, verifies the CAPTCHA answer and single-use nonce (plus optional Cloudflare Turnstile), enforces per-IP and per-mobile rate limits, deduplicates by normalized email or 10-digit Indian mobile, creates/links the company and contact (`lead_source = "Public Form"`), records an activity timeline entry, creates a `"Call new inquiry"` follow-up task due within 1 day, and logs an audit entry.

Deploy via Supabase CLI:

```bash
npx supabase functions deploy submit-inquiry --no-verify-jwt
```

(`supabase/config.toml` also declares `[functions.submit-inquiry]` with `verify_jwt = false`.)

## Environment Variables

### Edge Function Secrets (Supabase Dashboard / CLI)

Set these on your Supabase project (`npx supabase secrets set ...`), **never** in `apps/web` or `VITE_*`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_PUBLIC_URL` | Yes | Exact allowed frontend origin(s) for CORS, comma-separated (e.g. `https://sales.smpatelithub.in`). Wildcard `*` is not used. |
| `TURNSTILE_SECRET_KEY` | No | Cloudflare Turnstile secret key. Verification is enforced only when set. |

### Frontend Environment Variables (`apps/web`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Existing Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Existing Supabase anon key |
| `VITE_TURNSTILE_SITE_KEY` | No | Optional Cloudflare Turnstile site key. Widget renders only when set. |

## Verification Commands

```bash
npm test
npm run test:inquiry
npm run test:rls:anon
npm run check:secrets
```

