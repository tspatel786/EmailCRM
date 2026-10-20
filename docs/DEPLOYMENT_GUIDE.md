# Production Deployment Guide

**IT Services CRM & Email Automation System**  
**Version:** 1.0.0  
**Target Environment:** Supabase (Database, Auth, Storage, Edge Functions) + Node.js Worker (VPS/Docker/Render) + Static Web Frontend (Vercel/Cloudflare Pages/Netlify)

---

## 1. Prerequisites

- **Node.js**: v20+ LTS
- **Supabase CLI**: installed (`npm i -g supabase` or `brew install supabase/tap/supabase`)
- **Supabase Project**: Free or Pro tier project on [supabase.com](https://supabase.com)
- **Zoho Mail**: Zoho Workplace account with custom domain configured
- **Custom Domain DNS**: Cloudflare, Route53, Namecheap, or GoDaddy

---

## 2. Environment Variables Matrix

### Database & Auth (`apps/web/.env`)
```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### Worker Daemon (`worker/.env`)
```bash
NODE_ENV=production
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... # Service role key required for job claiming & RLS bypass
SMTP_HOST=smtppro.zoho.in # or smtp.zoho.com / smtppro.zoho.eu
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@yourdomain.com
SMTP_PASS=your-zoho-app-specific-password
SMTP_FROM=contact@yourdomain.com
POLL_INTERVAL_MS=3000
BATCH_SIZE=20
WORKER_CONCURRENCY=3
WORKER_PORT=8080
LOG_LEVEL=info
```

### Edge Functions Secrets (`supabase secrets set`)
```bash
supabase secrets set \
  SUPABASE_URL=https://<your-project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi... \
  SMTP_HOST=smtppro.zoho.in \
  SMTP_PORT=465 \
  SMTP_SECURE=true \
  SMTP_USER=contact@yourdomain.com \
  SMTP_PASS=your-zoho-app-specific-password \
  SMTP_FROM=contact@yourdomain.com
```

---

## 3. Database & Migrations Deployment

Link your local project to your remote Supabase project:
```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Apply all 12 migrations sequentially:
```bash
supabase db push
```

Verify that the following tables and extensions are created:
- Extensions: `pgcrypto`, `citext`
- Enums: `app_role`, `lead_status`, `deal_stage`, `call_outcome`, `task_status`, etc.
- Tables: `organizations`, `profiles`, `memberships`, `contacts`, `companies`, `campaigns`, `email_jobs`, `calls`, `tasks`, `meetings`, `deals`, `quotations`, `quotation_versions`, `projects`, `project_milestones`, `audit_logs`, `worker_heartbeats`, `org_email_daily_stats`, `rate_limits`.
- Functions: `claim_email_jobs`, `increment_org_email_stat`, `record_activity`, `check_rate_limit`.

Verify Storage Bucket:
- Bucket name: `org-documents`
- Public: `false`
- File size limit: 20MB
- RLS enabled with org membership verification.

---

## 4. Edge Functions Deployment

Deploy all 5 Supabase edge functions:
```bash
supabase functions deploy queue-campaign
supabase functions deploy send-test-email
supabase functions deploy invite-member
supabase functions deploy export-contacts
supabase functions deploy sync-calendar
```

Test invocation of public health / OPTIONS on functions:
```bash
curl -i -X OPTIONS https://<your-project-ref>.supabase.co/functions/v1/queue-campaign
```

---

## 5. Worker Service Deployment

The worker is a persistent Node.js daemon that claims email jobs using `SKIP LOCKED`, enforces organization daily quotas, sends emails via Zoho SMTP, and monitors task reminders.

### Option A: Docker Container

Build and run using Docker:
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY worker/ ./worker/
RUN npm ci
RUN npm run build -w @crm/shared
RUN npm run build -w @crm/worker

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/worker/dist ./worker/dist
COPY --from=build /app/worker/package.json ./worker/package.json
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "worker/dist/index.js"]
```

### Option B: Systemd on Linux VPS
Create `/etc/systemd/system/crm-worker.service`:
```ini
[Unit]
Description=IT Services CRM Email & Reminder Worker
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/crm
EnvironmentFile=/opt/crm/worker/.env
ExecStart=/usr/bin/node worker/dist/index.js
Restart=always
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```
Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now crm-worker
sudo systemctl status crm-worker
```

---

## 6. Frontend Build & Hosting

Build the production web bundle:
```bash
npm run build -w @crm/shared
npm run build -w @crm/web
```

The output files are generated in `apps/web/dist`.

Deploy to Cloudflare Pages, Vercel, or Netlify:
- **Build command:** `npm run build`
- **Output directory:** `apps/web/dist`
- **SPA routing rewrite:** Ensure all routes rewrite to `/index.html` (e.g. `/* -> /index.html 200`).

---

## 7. DNS & Email Authentication (Zoho Mail)

To ensure high inbox delivery and avoid spam folders:

1. **MX Records:**
   - Priority 10: `mx.zoho.in` (or `mx.zoho.com`)
   - Priority 20: `mx2.zoho.in`
   - Priority 50: `mx3.zoho.in`
2. **SPF Record (TXT):**
   - `v=spf1 include:zoho.in ~all`
3. **DKIM Record (TXT):**
   - Host: `zoho._domainkey.yourdomain.com`
   - Value: *(copied from Zoho Mail Control Panel)*
4. **DMARC Record (TXT):**
   - Host: `_dmarc.yourdomain.com`
   - Value: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com; pct=100; adkim=r; aspf=r`

---

## 8. Post-Deployment Verification Checklist

- [ ] Log in with initial owner account
- [ ] Create a company and a contact
- [ ] Send test email from campaign screen
- [ ] Check worker logs for successful claim and SMTP delivery
- [ ] Check worker `/healthz` HTTP endpoint returns 200
- [ ] Test unsubscribe link in sent email
- [ ] Verify audit log records member activities
