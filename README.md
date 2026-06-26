# mail.estrogen.delivery

really terrible (for now) self-contained webmail client and server. mostly a test of cloudflare's Email Routing and Email Sending binding. somehow it works

**WARNING: VIBELARPED!! NOT PROPERLY REVIEWED (YET)!! DONT TRUST THIS TOO MUCH**

## Stack

- **Worker** (`src/`): one script, two entrypoints. `fetch()` serves the `/api/*` JSON API and falls back to the SPA. `email()` ingests inbound mail.
- **D1** `estrogen-mail`: users, addresses, invites, messages, attachments, labels, contacts, FTS5 search.
- **R2** `estrogen-mail`: `raw/` (original .eml), `html/` (sanitized body), `att/` (attachments).
- **KV**: `session:*`, `login:*` and `send:*` rate-limit counters.
- **Email Sending** binding `EMAIL` for outbound; **Email Routing** rule for inbound.
- **SPA** (`public/`): vanilla JS webmail client, no build step.

## Security model

- Passwords: PBKDF2-SHA256, 210k iterations, per-user salt, constant-time compare.
- Sessions: opaque 32-byte token in KV, HttpOnly + SameSite=Lax cookie, 30-day TTL.
- Mutations check the `Origin` header against the host.
- Inbound HTML is sanitized (scripts/styles/iframes/handlers/js: URLs stripped) and rendered in a **sandboxed iframe without `allow-scripts`**, with a CSP that blocks remote images until the user opts in.
- Per-user storage quota and per-day send limit enforced.

## Invites

Signup requires an invite code. Admins mint codes (`POST /api/admin/invites`). The very first admin is created by signing up with the `ADMIN_BOOTSTRAP_CODE` secret as the invite.

## Deploy

```bash
npm install
npm run db:init          # apply schema to remote D1
npx wrangler secret put ADMIN_BOOTSTRAP_CODE
npm run deploy
```

## Remaining one-time email onboarding (needs account-level email permission)

The wrangler OAuth token used here lacks `email_sending:write` / `email_routing:write`. Refresh it with `wrangler login` (or use the dashboard), then:

```bash
npx wrangler email sending enable estrogen.delivery     # adds SPF + DKIM
npx wrangler email routing enable estrogen.delivery     # adds MX + DMARC
npx wrangler email routing rules create --type literal ... # or a catch-all to the worker
```

Route inbound mail for `*@estrogen.delivery` to the `estrogen-mail` worker (Dashboard > Email > Routing, set the catch-all action to "Send to a Worker" > estrogen-mail). Outbound works once the sending domain is verified.
