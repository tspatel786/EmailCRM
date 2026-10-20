# SMTP worker deployment

The worker must be a **long-running process** with a restart policy. Edge Functions are not used for Zoho SMTP.

## Environment

Same `SMTP_*` and `SUPABASE_SERVICE_ROLE_KEY` as `.env.example`. In production:

- `SMTP_MOCK=false`
- `NODE_ENV=production`
- Unique `WORKER_ID` per replica (`worker-1`, `worker-2`)
- `APP_PUBLIC_URL` = public CRM origin (unsubscribe links)

## Run

```bash
npm install
npm run start -w @crm/worker
```

`package.json` uses `tsx src/index.ts` so TypeScript in `packages/shared` resolves without a separate bundle step.

Docker example is in `worker/Dockerfile`. Health check: `GET http://127.0.0.1:8787/health`.

Restart policy: `on-failure` or systemd `Restart=always`. A crash does not drop `queued` jobs. Jobs stuck in `claimed` are requeued when the lease expires. Jobs stuck in `processing` are marked `failed` with `ambiguous_smtp_outcome_after_worker_crash` so they are **not** silently resent.

## Scaling

Multiple workers are safe because `claim_email_jobs` uses `FOR UPDATE SKIP LOCKED`. Keep `WORKER_BATCH_SIZE` small (default 10) for &lt;100 emails/day.
