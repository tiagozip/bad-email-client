function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeStr(str) {
  return b64urlFromBytes(new TextEncoder().encode(str));
}

let cachedSignKey = null;

async function signingKey(env) {
  if (cachedSignKey) return cachedSignKey;
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY);
  cachedSignKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedSignKey;
}

async function buildVapidJwt(env, aud) {
  const header = b64urlEncodeStr(JSON.stringify({ alg: "ES256", typ: "JWT" }));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const payload = b64urlEncodeStr(
    JSON.stringify({ aud, exp, sub: env.VAPID_SUBJECT || "mailto:hi@tiago.zip" }),
  );
  const signingInput = `${header}.${payload}`;
  const key = await signingKey(env);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${b64urlFromBytes(sig)}`;
}

export async function sendPush(env, userId, _payload) {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return;
  const res = await env.DB.prepare("SELECT id, endpoint FROM push_subscriptions WHERE user_id = ?")
    .bind(userId)
    .all();
  const subs = res.results || [];
  if (!subs.length) return;

  const jwtByOrigin = new Map();
  for (const sub of subs) {
    let origin;
    try {
      origin = new URL(sub.endpoint).origin;
    } catch {
      continue;
    }
    let jwt = jwtByOrigin.get(origin);
    if (!jwt) {
      jwt = await buildVapidJwt(env, origin);
      jwtByOrigin.set(origin, jwt);
    }
    try {
      const resp = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
          ttl: "2419200",
          "content-length": "0",
        },
      });
      if (resp.status === 404 || resp.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
      }
    } catch (e) {
      console.error("push send failed", sub.endpoint, e?.stack || e);
    }
  }
}
