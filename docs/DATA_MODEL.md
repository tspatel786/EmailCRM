# Data model

All tenant tables include `organization_id` unless noted (`profiles` is user-scoped; memberships bind users to orgs).

| Table | Purpose |
| --- | --- |
| `organizations` | Tenant root: name, timezone, email daily limit, retention |
| `profiles` | User profile keyed to `auth.users.id` |
| `memberships` | User ↔ org role and status |
| `companies` | Account / company records |
| `contacts` | People (leads and customers); `lifecycle` not delete-on-convert |
| `contact_emails` / `contact_phones` | Extra channels; primary email also on `contacts` for uniqueness |
| `contact_tags` / `contact_tag_map` | Tags |
| `contact_lists` / `contact_list_members` | Campaign segments |
| `import_batches` / `import_errors` | Excel/CSV import history |
| `email_templates` | Reusable plain + HTML bodies with `{{variables}}` |
| `campaigns` | Send operations |
| `email_jobs` | Per-recipient durable queue |
| `email_events` | Append-only job/campaign events |
| `suppressions` | Unsub / bounce / complaint |
| `calls` | Manual call logs |
| `activities` | Timeline projection |
| `tasks` | Follow-ups and work items |
| `meetings` / `meeting_attendees` | Meetings |
| `deals` | Pipeline |
| `quotations` / `quotation_versions` | Versioned quotes |
| `projects` / `project_members` / `project_milestones` | Delivery after win |
| `documents` | Metadata for Storage objects |
| `notifications` | In-app and reminder rows |
| `audit_logs` | Security-sensitive and data-change audit |
| `org_email_daily_stats` | Daily send counters |
| `worker_heartbeats` | Worker liveness |
| `edge_rate_limits` | Server-side rate buckets for Edge Functions (service role only) |

## Key business rules (also in SQL)

- One active membership per (org, user)
- Unique `lower(primary_email)` per org among non-archived contacts
- Marketing jobs require `consent_status = 'granted'` and no suppression
- Job claim is atomic (`FOR UPDATE SKIP LOCKED`)
- Quotations are versioned; a new version supersedes the previous current version
- Soft archive via `archived_at`; communication tables are not hard-deleted on convert

## Deletion policy

- Contacts/companies: archive, not hard delete
- Campaigns: cancel remaining jobs; keep history
- Auth user delete: memberships cascade; audit logs retain `actor_user_id` nullable
- Retention: `organizations.retention_days` documented for operators; scheduled purge is opt-in via worker flag (disabled by default)
