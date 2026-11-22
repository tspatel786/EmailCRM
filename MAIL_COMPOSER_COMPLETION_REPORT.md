# Mail Composer Upgrade – Completion Report

Date: 22 Nov 2026

## Deployment status

| Item | Status |
| --- | --- |
| Code (web, worker, resend-webhook) | Built and type-checked locally; **not deployed yet** |
| Migration `0026_mail_composer.sql` | Tested on the production database inside a rolled-back transaction (22/22 tests passed); **not applied yet** |
| Deploy order | 1) apply 0026 → 2) push code (web + worker redeploy) → 3) `supabase functions deploy resend-webhook`. The worker and Mails page read the new columns, so code must not go live before the migration. |

## Existing functionality inspected and reused (not recreated)

- `messages` table (Inbox / Sent / Queued / Failed), worker `processOutboundMessages` with retry, daily limit and crash recovery, Resend HTTPS transport, `resend-webhook` (inbound replies, delivery/open/click/bounce tracking, suppression), campaigns (`email_jobs`), templates and `personalize()` variables, RLS from migrations 0016/0024/0025.
- Campaign sending, inbound routing, tracking and suppression code paths are unchanged apart from the additions listed below.

## Implemented

**Composer (Gmail-style)** – `apps/web/src/components/mail/Composer.tsx`
- Docked bottom-right window with minimise and full-screen; full screen on phones
- To / Cc / Bcc with multiple recipients as chips, contact autocomplete, paste of comma/semicolon lists, invalid addresses highlighted; max 50 recipients
- Subject; link to a CRM contact and company (auto-linked when the address matches a contact)
- Rich-text editor (`RichTextEditor.tsx`, no new dependency): bold, italic, underline, font size, text colour, left/centre/right alignment, bulleted and numbered lists, links, inline images (upload or paste), clear formatting; pasting from Word/Gmail/web keeps formatting after sanitising
- Attachments: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, CSV, TXT, PNG, JPG, GIF, WEBP, ZIP; 10 MB per file, 10 files, 20 MB total; drag-and-drop; preview (images, PDF, text) or download
- Email templates menu with `{{name}}`, `{{company}}`, `{{service}}`, `{{email}}`, `{{phone}}`, `{{city}}` filled from the linked contact
- Per-user signature (Settings → My email signature), inserted automatically (above quoted text in replies)
- Drafts: Save draft, auto-save every 20 s, save on close, Drafts folder, reopen and edit, Discard (deletes the draft and its uploaded files)
- Send, Discard

**Actions** – `apps/web/src/pages/Mails.tsx`
- Reply, Reply all, Forward (original content quoted; forward copies the attachments)
- Conversation history (thread) in the reading pane
- Cc/Bcc, company link and attachments shown in the reader

**Backend**
- Worker sends Cc, Bcc, Reply-To, attachments (downloaded from private storage, re-validated) and sets `Message-ID` / `In-Reply-To` / `References` so replies thread correctly
- Outgoing composer HTML is sanitised again on the server (`worker/src/mail-html.ts`)
- `resend-webhook` threads inbound replies to the original mail (In-Reply-To/References, then subject fallback) and assigns them to the same owner, contact and company

## Migration `0026_mail_composer.sql`

- `messages`: `cc`, `bcc`, `company_id`, `attachments`, `rfc_message_id`; status `draft`; thread / message-id indexes
- `profiles.email_signature_html`
- Trigger `messages_client_guard`: browser users can only create drafts or queued outbound mail **as themselves**, need a write role, cannot fake sent/inbound mail, cannot attach files outside their own folder, and cannot change mail once queued/sent/received (except read/star)
- Policy: authors can delete their own drafts only
- Storage: private `mail-attachments` bucket (type and size limits; path `{org}/{user}/…`; readable by the author and Owner/Admin/Sales Manager of that org), public `mail-images` bucket for inline images (recipients' mail clients must be able to load them)
- Rollback: `supabase/rollback/0026_rollback.sql`

## Tests

- Database (production users, rolled back): **22/22 passed** – draft create/edit, manager can view but not edit/delete, viewer cannot see or compose, cannot compose as someone else, cannot insert sent or inbound mail, foreign-folder and oversized attachments rejected, cross-organization insert rejected, draft → queued, queued mail immutable but starrable, queued mail not deletable, own draft discard, worker (service role) unaffected, signatures editable only by their owner
- Server sanitiser: **10/10 passed** (formatting kept; script, event handlers, `javascript:` URLs, iframes and fixed positioning removed)
- `npm run typecheck` 0 errors, `npm run test:inquiry` 8/8, `npm run build` success, `npm run check:secrets` clean

Live end-to-end sending, replying, forwarding and attachment delivery can only be verified after the migration is applied and the code deployed.

## Limitations

- Inline images are hosted in a public bucket under an unguessable URL (needed for recipients to see them); attachments are private.
- Rich-text editing uses the browser's built-in editing commands (works in all current browsers, but heavy Word layouts may be simplified).
- Drafts are per user; there is no shared/team draft.
- Attachment total is capped at 20 MB (Resend allows 40 MB including encoding overhead).
