# Operational Runbook

**IT Services CRM & Email Automation System**  
**Version:** 1.0.0  
**Target Audience:** DevOps Engineers, System Administrators, Support Leads

---

## 1. System Architecture Overview

```
[ Web Browser ]
      │
      ├─ HTTPS ──────────► [ Supabase Edge Functions ] ──► [ Supabase Auth / DB / Storage ]
      │                                                               ▲
      └─ Supabase Client ─────────────────────────────────────────────┘
                                                                      ▲
[ Node.js Worker Daemon ] ── PostgreSQL (claim_email_jobs) ───────────┤
      │
      └─ SMTP SSL (Port 465) ──► [ Zoho Mail MTA ] ──► [ Recipient Inboxes ]
```

---

## 2. Worker Monitoring & Health Checks

### Health Endpoint
The worker exposes a lightweight HTTP server on port `8080` (or `WORKER_PORT`):
- `GET /healthz`
  - Returns `200 OK {"status":"ok","worker_id":"...","uptime":1234}`
  - Used for Docker health checks, Kubernetes liveness probes, or Uptime Kuma monitoring.

### Database Heartbeats
The worker reports a heartbeat every 30 seconds into `public.worker_heartbeats`:
```sql
SELECT worker_id, started_at, last_seen_at, jobs_claimed, jobs_sent, jobs_failed,
       ROUND(EXTRACT(EPOCH FROM (now() - last_seen_at))) as seconds_since_seen
FROM public.worker_heartbeats
ORDER BY last_seen_at DESC;
```
**Alert condition:** If `seconds_since_seen > 120`, the worker process is down or stuck.

---

## 3. Email Queue & Dead Letter Queue (DLQ) Management

### Inspecting Queue Status
```sql
SELECT status, count(*) 
FROM public.email_jobs 
GROUP BY status;
```
Possible statuses:
- `pending`: Waiting to be claimed.
- `processing`: Claimed by a worker; lock active.
- `sent`: Successfully delivered to SMTP server.
- `failed`: Terminal failure or unrecoverable error.
- `dead_letter`: Max retry count reached (default 5 attempts).

### Re-queuing Dead Letter Jobs
When an underlying SMTP outage or configuration issue is resolved:
```sql
-- Re-queue dead letter jobs for a specific campaign:
UPDATE public.email_jobs
SET status = 'pending',
    retry_count = 0,
    next_retry_at = now(),
    last_error = NULL
WHERE status = 'dead_letter' 
  AND campaign_id = '<campaign-uuid>';
```

### Unlocking Stuck Processing Jobs
If a worker crashed while jobs were claimed:
```sql
-- Jobs that have been locked for more than 15 minutes without update:
UPDATE public.email_jobs
SET status = 'pending',
    claimed_by = NULL,
    claimed_at = NULL
WHERE status = 'processing'
  AND claimed_at < now() - INTERVAL '15 minutes';
```

---

## 4. Daily Email Quota & Rate Limit Operations

### Checking Organization Quota Utilization
Each organization has a `daily_email_limit` in `public.organizations`. Usage is tracked daily in `public.org_email_daily_stats`:
```sql
SELECT o.name, o.daily_email_limit, 
       COALESCE(s.accepted_count, 0) as sent_today,
       COALESCE(s.failed_count, 0) as failed_today,
       (o.daily_email_limit - COALESCE(s.accepted_count, 0)) as remaining_quota
FROM public.organizations o
LEFT JOIN public.org_email_daily_stats s
  ON s.organization_id = o.id AND s.send_date = CURRENT_DATE;
```

### Increasing an Organization's Daily Limit
```sql
UPDATE public.organizations
SET daily_email_limit = 500
WHERE id = '<org-uuid>';
```

---

## 5. Zoho SMTP Troubleshooting

### Common Error Codes & Mitigations

1. **`535 Authentication Failed` / Invalid credentials**
   - Cause: Password changed or two-factor auth enabled on Zoho without using an Application-Specific Password.
   - Action: Generate a new App Password in Zoho Accounts -> Security -> App Passwords, update `SMTP_PASS` in worker `.env` and edge function secrets, then restart the worker.

2. **`554 5.7.1 Relay Access Denied`**
   - Cause: `SMTP_FROM` address does not match the authenticated Zoho account email or configured alias.
   - Action: Ensure `SMTP_FROM` exactly matches `SMTP_USER` or a verified Zoho alias.

3. **`421 Too many concurrent connections`**
   - Cause: Worker concurrency too high for the Zoho plan.
   - Action: Reduce `WORKER_CONCURRENCY=2` and `POLL_INTERVAL_MS=5000` in `worker/.env`.

---

## 6. Incident Response Checklist

### In Case of Worker Crash / Stoppage:
1. Check journal logs: `journalctl -u crm-worker -n 100 -f` or `docker logs crm-worker --tail 100`
2. Test SMTP connectivity:
   ```bash
   node -e "const nodemailer = require('nodemailer'); const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: 465, secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }); t.verify().then(() => console.log('OK')).catch(console.error);"
   ```
3. Restart worker: `sudo systemctl restart crm-worker`
4. Verify `/healthz` responds with HTTP 200.
