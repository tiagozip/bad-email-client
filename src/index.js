import { handleApi } from "./api.js";
import { reverifyAllDomains } from "./domains.js";
import { handleEmail } from "./mail.js";
import { processScheduledSends, wakeSnoozed } from "./scheduler.js";
import { error } from "./util.js";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

function harden(res) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      let res;
      try {
        res = await handleApi(request, env, ctx);
      } catch (e) {
        console.error("api error", e?.stack || e);
        res = error(500, "internal error");
      }
      return harden(res);
    }
    const res = await env.ASSETS.fetch(request);
    if ((request.headers.get("accept") || "").includes("text/html")) return harden(res);
    return res;
  },

  async email(message, env, ctx) {
    try {
      await handleEmail(message, env, ctx);
    } catch (e) {
      console.error("email handler error", e?.stack || e);
      message.setReject("451 4.3.0 Temporary processing error");
    }
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "17 7 * * *") {
      ctx.waitUntil(
        reverifyAllDomains(env).catch((e) => console.error("reverify error", e?.stack || e)),
      );
      return;
    }
    ctx.waitUntil(
      Promise.all([
        processScheduledSends(env).catch((e) => console.error("sched send error", e?.stack || e)),
        wakeSnoozed(env).catch((e) => console.error("wake snooze error", e?.stack || e)),
      ]),
    );
  },
};
