# estrogen.delivery relay

A tiny Cloudflare Worker that lets you use **your own domain** with [mail.estrogen.delivery](https://mail.estrogen.delivery), fully on your own Cloudflare account. No SMTP, no server, no env juggling.

It does two things:

- **Receive:** Email Routing delivers inbound mail to this Worker, which forwards it (signed) to the mail app.
- **Send:** the mail app asks this Worker to send outbound mail as your domain, via Cloudflare Email Sending.

Everything is authenticated with an HMAC secret that only you and the app share.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tiagozip/mail/tree/main/relay)

1. Click the button. It clones this Worker into your own Cloudflare account.
2. When asked for **`RELAY_CONFIG`**, paste the single value you copied from the mail app (Settings → Domains → Bring your own domain). That's the only thing to set.
3. After it deploys, in the Cloudflare dashboard for your domain:
   - **Email → Email Routing**: set the catch-all action to **Send to a Worker → estrogen-mail-relay**.
   - **Email → Email Sending**: enable it for your domain so the Worker can send as `you@yourdomain`.
4. Back in the mail app, paste your Worker's URL and hit verify.

That's it. `RELAY_CONFIG` is a base64 bundle of the shared secret, your domain, and the mail endpoint, so there's nothing else to wire up.
