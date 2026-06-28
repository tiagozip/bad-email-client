# mail.estrogen.delivery

really terrible (for now) self-contained webmail client and server. mostly a test of cloudflare's Email Routing and Email Sending binding. somehow it works

**WARNING: VIBELARPED!! NOT PROPERLY REVIEWED (YET)!! DONT TRUST THIS TOO MUCH**

## invites

Signup requires an invite code. Admins mint codes (`POST /api/admin/invites`). The very first admin is created by signing up with the `ADMIN_BOOTSTRAP_CODE` secret as the invite.

## deploy

```bash
npm install
npm run db:init          # apply schema to remote D1
npx wrangler secret put ADMIN_BOOTSTRAP_CODE
npm run deploy
```
