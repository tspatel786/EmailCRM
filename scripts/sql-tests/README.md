# Database permission tests

SQL suites that impersonate real users (owner, sales manager, sales executive, viewer) and check
row-level security and trigger rules. Each suite only creates temporary rows.

**Always run inside a transaction that is rolled back:**

```sql
begin;
\i scripts/sql-tests/payments_test.sql
rollback;
```

Requirements: an organization with slug `smpatel-it-hub` that has at least one active member in
each role (owner, sales_manager, sales_executive, viewer) and a second organization. On a fresh
local database run `npm run seed` first (seeding is refused against the hosted project).

The last statement of each suite returns one row per check with `PASS` / `FAIL`.

| Suite | Checks |
| --- | --- |
| `mail_composer_test.sql` | 22 – drafts, compose-as-self, immutable sent mail, attachments, cross-org, signatures |
| `payments_test.sql` | 39 – full/partial/advance, balance, duplicates, excess approval, edit audit, void, roles, isolation |
