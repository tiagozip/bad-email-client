// estrogen.delivery bring-your-own-domain relay.
// One secret to set: RELAY_CONFIG (copy it from Settings > Domains in the mail app).
// It's a base64 bundle of your shared secret + domain + the mail endpoint — nothing else to configure.
const enc = new TextEncoder();
const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const sha256hex = async (bytes) => toHex(await crypto.subtle.digest("SHA-256", bytes));
function tseq(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const randHex = (n) => {
  const u = new Uint8Array(n);
  crypto.getRandomValues(u);
  return toHex(u);
};
const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
function b64ToBuf(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
const ALLOWED_HEADERS = new Set(["in-reply-to", "references"]);

function config(env) {
  const o = JSON.parse(atob(env.RELAY_CONFIG));
  return {
    SECRET: o.s,
    DOMAIN: String(o.d).toLowerCase(),
    MAIL_ENDPOINT: String(o.m).replace(/\/$/, ""),
  };
}

export default {
  async email(message, env, ctx) {
    const { SECRET, DOMAIN, MAIL_ENDPOINT } = config(env);
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const rcpt = String(message.to || "").trim().toLowerCase();
    const mailfrom = String(message.from || "").trim().toLowerCase();
    const ts = Date.now().toString();
    const nonce = randHex(16);
    const sig = await hmacHex(
      SECRET,
      "ingest\n" + ts + "\n" + nonce + "\n" + DOMAIN + "\n" + rcpt + "\n" + mailfrom + "\n" + (await sha256hex(raw)),
    );
    let ok = false;
    try {
      const res = await fetch(MAIL_ENDPOINT + "/api/byod/ingest", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          "content-type": "message/rfc822",
          "x-relay-domain": DOMAIN,
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
    const { SECRET, DOMAIN } = config(env);
    const url = new URL(request.url);
    const ts = request.headers.get("x-relay-ts") || "";
    const nonce = request.headers.get("x-relay-nonce") || "";
    const sig = request.headers.get("x-relay-sig") || "";
    if (!/^\d{13}$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 300000) return json(401, { error: "stale" });
    if (!/^[a-f0-9]{16,64}$/.test(nonce)) return json(401, { error: "bad nonce" });

    if (url.pathname === "/health" && request.method === "POST") {
      if (!tseq(sig, await hmacHex(SECRET, "health\n" + ts + "\n" + nonce))) return json(401, { error: "bad sig" });
      return json(200, { ok: true, domain: DOMAIN });
    }

    if (url.pathname === "/send" && request.method === "POST") {
      const body = await request.text();
      if (!tseq(sig, await hmacHex(SECRET, "send\n" + ts + "\n" + nonce + "\n" + (await sha256hex(enc.encode(body))))))
        return json(401, { error: "bad sig" });
      let p;
      try {
        p = JSON.parse(body);
      } catch {
        return json(400, { error: "bad json" });
      }
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
