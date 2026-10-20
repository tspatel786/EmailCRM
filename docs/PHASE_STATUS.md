# Implementation status

Phases 1–8 are present in this repository. Production go-live still requires company secrets, a Supabase project, a static host, a worker VM, and a restore drill.

| Phase | Status | Notes |
| --- | --- | --- |
| 1 Schema, RLS | Implemented | `supabase/migrations` 0001–0012 |
| 2 Auth, orgs, dashboard | Implemented | Invite-only Auth; dashboard queries live tables |
| 3 CRM, import, timeline | Implemented | Duplicate email index; import preview/history |
| 4 Calls, tasks, reminders | Implemented | Manual calls; worker notifications |
| 5 Email, queue, worker | Implemented | Edge `queue-campaign` + Node worker |
| 6 Pipeline, quotes, meetings, projects | Implemented | Win converts contact + project; print-to-PDF |
| 7 Reports, audit, export | Implemented | RLS-scoped Excel exports |
| 8 Tests, security, backups, deploy docs | Implemented | Unit tests run locally; live RLS needs seeded Supabase |

Not implemented (by design until explicitly requested):

- Cloud telephony and call recording
- Calendar OAuth sync
- Automated bounce ingestion from Zoho
- Inbox “delivered” without provider evidence
