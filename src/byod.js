import { decryptText, encryptText } from "./crypto.js";
import { storeInbound } from "./mail.js";
import { normalizeAddr } from "./util.js";

const SKEW_MS = 300000;
const MAX_INGEST_BYTES = 26214400;
const RELAY_TIMEOUT_MS = 10000;
const MAX_RELAY_RESP = 16384;
const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

async function sha256hex(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

function timingSafeEqual(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (aa.length !== bb.length) return false;
  let r = 0;
  for (let i = 0; i < aa.length; i++) r |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return r === 0;
}

function randHex(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export function generateRelaySecret() {
  return randHex(32);
}

export const RELAY_DEPLOY_URL =
  "https://deploy.workers.cloudflare.com/?url=https://github.com/tiagozip/mail/tree/main/relay";

export function relayConfigToken(secret, domain, mailEndpoint) {
  const json = JSON.stringify({
    s: secret,
    d: String(domain).toLowerCase(),
    m: String(mailEndpoint).replace(/\/$/, ""),
  });
  return bufToB64(enc.encode(json));
}

function bufToB64(bytes) {
  let bin = "";
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(env, domain, secret) {
  return bufToB64(await encryptText(env, `${domain}\n${secret}`));
}

export async function decryptRelaySecret(env, domain, secretEnc) {
  const pt = await decryptText(env, b64ToBytes(secretEnc));
  const i = pt.indexOf("\n");
  if (i < 0 || pt.slice(0, i) !== domain) throw new Error("relay secret/domain mismatch");
  return pt.slice(i + 1);
}

function validTs(ts) {
  if (!/^\d{13}$/.test(String(ts || ""))) return false;
  return Math.abs(Date.now() - Number(ts)) <= SKEW_MS;
}

const noNewline = (s) => typeof s === "string" && !/[\r\n]/.test(s);

async function consumeNonce(env, domain, nonce) {
  const key = `byod:nonce:${domain}:${nonce}`;
  try {
    if (await env.KV.get(key)) return false;
    await env.KV.put(key, "1", { expirationTtl: 900 });
    return true;
  } catch {
    return false;
  }
}

async function rateOk(env, domain) {
  const key = `byod:in:${domain}:${Math.floor(Date.now() / 3600000)}`;
  try {
    const n = Number.parseInt((await env.KV.get(key)) || "0", 10);
    if (n >= 5000) return false;
    await env.KV.put(key, String(n + 1), { expirationTtl: 4000 });
    return true;
  } catch {
    return false;
  }
}

export async function byodIngest(request, env, ctx) {
  const domain = String(request.headers.get("x-relay-domain") || "")
    .toLowerCase()
    .trim();
  const rcpt = normalizeAddr(request.headers.get("x-relay-rcpt") || "");
  const mailfrom = normalizeAddr(request.headers.get("x-relay-mailfrom") || "");
  const ts = request.headers.get("x-relay-ts") || "";
  const nonce = request.headers.get("x-relay-nonce") || "";
  const sig = request.headers.get("x-relay-sig") || "";

  if (!domain || !rcpt || !validTs(ts) || !/^[a-f0-9]{16,64}$/.test(nonce))
    return new Response("bad request", { status: 400 });
  if (!noNewline(domain) || !noNewline(rcpt) || !noNewline(mailfrom))
    return new Response("bad request", { status: 400 });
  if ((rcpt.split("@")[1] || "").toLowerCase() !== domain)
    return new Response("recipient not on domain", { status: 422 });

  const declared = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (declared > MAX_INGEST_BYTES) return new Response("too large", { status: 413 });

  const row = await env.DB.prepare(
    "SELECT owner_id, relay_secret_enc FROM domains WHERE domain = ? AND relay_url IS NOT NULL AND verified = 1",
  )
    .bind(domain)
    .first();
  if (!row?.relay_secret_enc || !row.owner_id) return new Response("unknown domain", { status: 404 });

  if (!(await rateOk(env, domain))) return new Response("rate limited", { status: 429 });

  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength === 0 || raw.byteLength > MAX_INGEST_BYTES)
    return new Response("bad size", { status: 413 });

  let secret;
  try {
    secret = await decryptRelaySecret(env, domain, row.relay_secret_enc);
  } catch {
    return new Response("secret error", { status: 500 });
  }
  const signed = `ingest\n${ts}\n${nonce}\n${domain}\n${rcpt}\n${mailfrom}\n${await sha256hex(raw)}`;
  if (!timingSafeEqual(sig, await hmacHex(secret, signed)))
    return new Response("bad signature", { status: 401 });

  if (!(await consumeNonce(env, domain, nonce))) return new Response("replay", { status: 409 });

  try {
    await storeInbound(env, ctx, {
      raw,
      userId: row.owner_id,
      matchedAddress: rcpt,
      envelopeFrom: mailfrom,
    });
  } catch (e) {
    if (e?.permanent) return new Response(`rejected: ${e.message}`, { status: 422 });
    console.error("byod ingest store error", e?.stack || e);
    return new Response("temporary failure", { status: 503 });
  }
  return Response.json({ ok: true });
}

async function readCapped(res) {
  const buf = await res.arrayBuffer();
  const slice = new Uint8Array(buf).slice(0, MAX_RELAY_RESP);
  try {
    return JSON.parse(new TextDecoder().decode(slice));
  } catch {
    return null;
  }
}

export async function sendViaRelay(env, domainRow, sendPayload) {
  const secret = await decryptRelaySecret(env, domainRow.domain, domainRow.relay_secret_enc);
  const payload = { ...sendPayload };
  if (Array.isArray(payload.attachments) && payload.attachments.length) {
    payload.attachments = payload.attachments.map((a) => ({
      filename: a.filename,
      type: a.type,
      disposition: a.disposition,
      contentId: a.contentId,
      b64: true,
      content: bufToB64(a.content),
    }));
  }
  const body = JSON.stringify(payload);
  const ts = Date.now().toString();
  const nonce = randHex(16);
  const sig = await hmacHex(secret, `send\n${ts}\n${nonce}\n${await sha256hex(enc.encode(body))}`);
  let res;
  try {
    res = await fetch(`${String(domainRow.relay_url).replace(/\/$/, "")}/send`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "x-relay-ts": ts,
        "x-relay-nonce": nonce,
        "x-relay-sig": sig,
      },
      body,
    });
  } catch (e) {
    throw new Error(`relay unreachable: ${e?.message || e}`);
  }
  if (!res.ok) {
    const data = await readCapped(res);
    throw new Error(`relay send failed: ${res.status} ${(data?.error || "").slice(0, 160)}`);
  }
  return (await readCapped(res)) || {};
}

export async function verifyRelay(relayUrl, secret, expectedDomain) {
  const ts = Date.now().toString();
  const nonce = randHex(16);
  const sig = await hmacHex(secret, `health\n${ts}\n${nonce}`);
  let res;
  try {
    res = await fetch(`${String(relayUrl).replace(/\/$/, "")}/health`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      headers: { "x-relay-ts": ts, "x-relay-nonce": nonce, "x-relay-sig": sig },
    });
  } catch (e) {
    return { ok: false, error: `could not reach relay: ${e?.message || e}` };
  }
  if (!res.ok) return { ok: false, error: `relay returned ${res.status}` };
  const data = await readCapped(res);
  if (!data?.ok) return { ok: false, error: "relay rejected the shared secret" };
  if (String(data.domain || "").toLowerCase() !== String(expectedDomain).toLowerCase())
    return { ok: false, error: `relay is bound to ${data.domain}, not ${expectedDomain}` };
  return { ok: true };
}

export function relayWorkerCode(secret, domain, mailEndpoint) {
  return `// estrogen.delivery BYOD relay — paste into a new Worker on YOUR Cloudflare account.
// No env vars to set. Just add a send_email binding named EMAIL, then point your
// domain's Email Routing catch-all at this Worker and enable Email Sending for it.
const RELAY_SECRET = ${JSON.stringify(secret)};
const DOMAIN = ${JSON.stringify(String(domain).toLowerCase())};
const MAIL_ENDPOINT = ${JSON.stringify(String(mailEndpoint).replace(/\/$/, ""))};
const enc = new TextEncoder();
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const sha256hex = async (bytes) => toHex(await crypto.subtle.digest("SHA-256", bytes));
function tseq(a, b) { a = String(a||""); b = String(b||""); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const randHex = (n) => { const u = new Uint8Array(n); crypto.getRandomValues(u); return toHex(u); };
const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
function b64ToBuf(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
const ALLOWED_HEADERS = new Set(["in-reply-to", "references"]);

export default {
  async email(message, env, ctx) {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const domain = DOMAIN;
    const rcpt = String(message.to || "").trim().toLowerCase();
    const mailfrom = String(message.from || "").trim().toLowerCase();
    const ts = Date.now().toString();
    const nonce = randHex(16);
    const sig = await hmacHex(RELAY_SECRET, "ingest\\n" + ts + "\\n" + nonce + "\\n" + domain + "\\n" + rcpt + "\\n" + mailfrom + "\\n" + (await sha256hex(raw)));
    let ok = false;
    try {
      const res = await fetch(MAIL_ENDPOINT.replace(/\\/$/, "") + "/api/byod/ingest", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "content-type": "message/rfc822",
          "x-relay-domain": domain,
          "x-relay-rcpt": rcpt,
          "x-relay-mailfrom": mailfrom,
          "x-relay-ts": ts,
          "x-relay-nonce": nonce,
          "x-relay-sig": sig,
        },
        body: raw,
      });
      ok = res.ok;
      if (res.status === 422 || res.status === 413) ok = true; // permanent reject: drop, don't loop
    } catch {}
    if (!ok) message.setReject("451 4.3.0 Mailbox temporarily unavailable, please retry");
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const ts = request.headers.get("x-relay-ts") || "";
    const nonce = request.headers.get("x-relay-nonce") || "";
    const sig = request.headers.get("x-relay-sig") || "";
    if (!/^\\d{13}$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 300000) return json(401, { error: "stale" });
    if (!/^[a-f0-9]{16,64}$/.test(nonce)) return json(401, { error: "bad nonce" });

    if (url.pathname === "/health" && request.method === "POST") {
      if (!tseq(sig, await hmacHex(RELAY_SECRET, "health\\n" + ts + "\\n" + nonce))) return json(401, { error: "bad sig" });
      return json(200, { ok: true, domain: DOMAIN });
    }

    if (url.pathname === "/send" && request.method === "POST") {
      const body = await request.text();
      if (!tseq(sig, await hmacHex(RELAY_SECRET, "send\\n" + ts + "\\n" + nonce + "\\n" + (await sha256hex(enc.encode(body)))))) return json(401, { error: "bad sig" });
      let p;
      try { p = JSON.parse(body); } catch { return json(400, { error: "bad json" }); }
      const from = String(p?.from?.email || "").toLowerCase();
      if (!from.endsWith("@" + DOMAIN)) return json(403, { error: "from domain not allowed" });
      const count = [].concat(p.to || [], p.cc || [], p.bcc || []).length;
      if (count > 50) return json(400, { error: "too many recipients" });
      if (p.headers && typeof p.headers === "object") {
        const safe = {};
        for (const k of Object.keys(p.headers)) if (ALLOWED_HEADERS.has(k.toLowerCase())) safe[k] = p.headers[k];
        p.headers = safe;
      }
      if (Array.isArray(p.attachments)) p.attachments = p.attachments.map((a) => (a.b64 ? { ...a, content: b64ToBuf(a.content) } : a));
      try {
        const r = await env.EMAIL.send(p);
        return json(200, { ok: true, messageId: r?.messageId || null });
      } catch (e) {
        return json(502, { error: String(e?.message || e).slice(0, 160) });
      }
    }
    return json(404, { error: "not found" });
  },
};
`;
}
