# Frontend hosting and custom domain

Build:

```bash
npm install
npm run build -w @crm/web
```

Output: `apps/web/dist`. Host that folder on any static HTTPS provider (Cloudflare Pages, Netlify, S3+CloudFront, nginx).

Required build-time variables (non-secret):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL` (public origin)

SPA routing: rewrite all paths to `index.html`.

Custom domain:

1. Add the hostname at the static host.
2. Create HTTPS (managed certificate).
3. Point DNS A/CNAME as the host instructs.
4. Set the same origin on Supabase Auth Site URL and redirect allow-list.

Yearly domain renewal is independent of the static host and of Supabase. See [YEARLY_HOSTING.md](YEARLY_HOSTING.md).
