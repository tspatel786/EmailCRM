# Yearly hosting, domain, and ownership

| Item | Typical term | Owner | Notes |
| --- | --- | --- | --- |
| Company domain | 1 year | Company registrar account | Enable registrar lock + 2FA. DNS at host or registrar. |
| Frontend static host | Monthly or yearly | Company | Custom domain + HTTPS cert auto-renew if configured |
| Supabase project | Monthly (often billed yearly credits) | Company email | Plan limits: DB size, storage, egress, Auth MAU, backup retention |
| Worker VM/container | Monthly | Company | Restart policy, disk for logs only |
| Zoho Mail | Yearly | Company | SMTP mailbox and app password rotation |

Responsibilities:

- Domain expiry takes the CRM **and** unsubscribe links offline.
- Supabase pause/lock on unpaid invoices makes Auth and data unavailable even if the frontend still loads.
- Provider backups expire on their schedule regardless of domain renewal.
- Storage quotas: attachments can fill the bucket independently of the database.

Set calendar reminders 30 days before domain, Zoho, and cloud account renewals. Keep billing ownership with two employees, not a single personal email.
