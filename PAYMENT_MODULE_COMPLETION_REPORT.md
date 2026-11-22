# Payment Module – Completion Report

Project: S.M. PATEL IT HUB CRM (https://sales.smpatelithub.in)
Date: 22 Nov 2026

## Deployment status

| Item | Status |
| --- | --- |
| Code (web) | Built and type-checked locally; **not deployed yet** |
| Migration `0027_payments.sql` | Tested on the production database inside a rolled-back transaction (39/39 tests passed); **not applied yet** |
| Reason | Applying production migrations needs explicit owner approval in this session. Deploy order: apply migration 0027, then push the web code. The web code must not go live before the migration, because the Payments page and dashboard cards read the new tables. |

## 1. Existing features inspected

- `quotations` (status flow draft → pending_approval → approved → sent → accepted/rejected; `total_amount`, `currency`, `contact_id`, `company_id`, `owner_user_id`, approval by Owner/Admin)
- `quotation_versions`, `contacts`, `companies`, `deals`
- Row-level security model: owners see their own records; Owner/Admin/Sales Manager see all records (`has_view_all_role`, migration 0025); only the owner or Owner/Admin can write
- Existing patterns reused: `downloadWorkbook` (Excel export), `money`/`fmtDate` formatters, UI kit (`Card`, `Modal`, `StatCard`, `Badge`, `Toolbar`), Dashboard date-range + "My data only" filter, Reports date range

Nothing in quotations, deals or the email system was changed.

## 2. New features

**Payments page** (`/app/payments`, sidebar under CRM → Payments)
- Payment list with search (receipt, reference, customer, quotation, notes) and filters: customer, quotation, mode, status (valid/void), date range
- "By quotation" view: quotation amount, received, outstanding, status (Pending / Partial / Paid), payment count; click for full quotation-wise payment history
- Add payment: pick an approved quotation → amount pre-filled with the outstanding balance; mode (Cash / UPI / Bank Transfer); transaction reference (required for UPI and bank transfer); payment date (no future dates); type (Advance / Partial, automatically **Full** when one payment covers the whole amount); notes
- Multiple payments per quotation; outstanding updates immediately
- Edit payment with full **audit history** (who changed what, from → to, when)
- Void payment with a reason (payments are never deleted); voided payments stay visible but do not count
- **Payment receipt PDF** (A4) with receipt number, customer, quotation, amount, mode, reference, paid to date and outstanding balance; voided receipts are watermarked VOID; offered automatically after saving
- Over-payment protection: amounts above the outstanding balance are rejected; an Owner/Admin can accept an excess only by entering an **excess adjustment reason**, which is recorded with the approver
- Excel export of both views

**Dashboard** – new "Payments" card group: Total Payments Received (payments dated in the selected range), Pending Payments, Partial Payments, Outstanding Amount (approved quotations created up to the end date). Respects "My data only" and role visibility.

**Reports** – new "Payment reports" card using the page's date range: Customer-wise, Quotation-wise, Date-wise collection (split by mode), Outstanding payments; totals row; Excel export (date-wise exports every individual payment).

## 3. Database changes (`supabase/migrations/0027_payments.sql`)

- Enums: `payment_mode` (cash, upi, bank_transfer), `payment_kind` (advance, partial, full), `payment_record_status` (valid, void)
- Table `payments` (amount numeric(14,2) > 0, receipt number unique per organization, reference unique per organization among valid payments – case/space-insensitive)
- Table `payment_audit` (created / updated / voided, with field-level changes)
- Table `org_counters` (receipt sequence per organization per year: `RCPT-2026-0001`)
- View `quotation_payment_summary` (`security_invoker`, so it follows the caller's permissions): received, outstanding = quotation amount − valid payments, status pending/partial/paid
- Trigger `payments_before_write`: only approved/sent/accepted quotations; copies contact, company and owner from the quotation (cannot be spoofed); locks the quotation row so two simultaneous payments cannot overpay; balance check; excess approval; automatic Full/Partial; receipt number; immutable organization, quotation and receipt number; void requires a reason; voided payments cannot be edited
- Trigger `payments_after_write`: writes the audit history
- Rollback: `supabase/rollback/0027_rollback.sql`

## 4. Permission checks

| Role | See payments | Record / edit / void | Accept excess |
| --- | --- | --- | --- |
| Owner / Admin | All | All quotations | Yes |
| Sales Manager | All (view) | Own quotations only (matches existing CRM write rules) | No |
| Sales Executive | Own quotations / payments they recorded | Own quotations only | No |
| Viewer | Own only (read-only) | No | No |

Enforced by RLS on `payments` and `payment_audit` plus the trigger; there is no delete permission. The UI hides actions a role cannot perform.

## 5. Tests and results

Database tests ran as real production users (owner, sales manager, sales executive, viewer) inside a transaction that was rolled back – **39/39 passed**:

- Single full payment → kind "full", receipt number generated, status Paid
- Payment above outstanding rejected
- Advance + partial payments → outstanding 10000 − 5000 = 5000, status Partial; advance kind kept
- Duplicate transaction reference rejected (also with different case and spaces)
- Payment against an unapproved quotation rejected
- Spoofed contact id overwritten from the quotation
- Manager sees but cannot add to an executive's quotation; viewer cannot see or add
- Executive cannot approve an excess; Owner without reason rejected; Owner with reason accepted and approver recorded; overpaid quotation shows outstanding 0
- Edit amount → audit entry; moving a payment to another quotation rejected; raising an edit above the balance rejected
- Void needs a reason; void logged; voided payment cannot be edited; payments cannot be deleted; voided amount excluded from received
- Audit visible to the owner, hidden from the viewer
- Writing into another organization rejected; receipt counters not readable

Other checks: `npm run typecheck` (0 errors, all workspaces), `npm run test:inquiry` (8/8), `npm run build` (success), `npm run check:secrets` (clean), receipt PDF generated with the production code and visually checked.

## 6. Bugs found and fixed during the work

- In a `SECURITY DEFINER` trigger `current_user` is always the function owner, so every caller looked like a service account and a Sales Executive could approve an excess payment. Fixed by identifying the caller from the request JWT. Caught by the test suite before deployment.
- Lowering a payment amount was blocked when a quotation was already overpaid through an approved adjustment. Edits are now only balance-checked when the amount increases.

## 7. Limitations

- Excel export and receipt are generated in the browser (no server-side copies are stored).
- Built-in PDF fonts have no ₹ symbol; amounts show as "INR 1,85,000.00".
- No GST, invoicing, accounting or WhatsApp (out of scope by request).
- Dashboard "Pending/Partial/Outstanding" are a snapshot as of the selected end date; "Received" uses the date range.
