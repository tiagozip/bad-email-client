import { Badge, Button, Input, Link, Loader } from "@cloudflare/kumo";
import {
  ArrowLeft,
  ArrowSquareOut,
  CheckCircle,
  Plus,
  ShieldCheck,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notify, notifyError } from "../toast.js";
import { humanSize, relativeTime } from "../util.js";

function Domains() {
  const [domains, setDomains] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState("");
  const [lookups, setLookups] = useState({});

  useEffect(() => {
    api
      .domains()
      .then((d) => setDomains(d.domains || []))
      .catch(notifyError);
  }, []);

  async function add(e) {
    e.preventDefault();
    const d = input.trim().toLowerCase();
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      await api.addDomain(d);
      setInput("");
      const res = await api.domains();
      setDomains(res.domains || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(id) {
    setVerifying(id);
    try {
      const res = await api.verifyDomain(id);
      setLookups((p) => ({ ...p, [id]: res }));
      setDomains((p) =>
        (p || []).map((d) =>
          d.id === id ? { ...d, verified: res.verified, sendVerified: res.sendVerified } : d,
        ),
      );
      if (res.verified && res.sendVerified)
        notify("Domain ready", "This domain can send and receive mail.", "success");
      else if (res.verified)
        notify("Receiving verified", "Set up Email Sending to send from this domain too.", "success");
    } catch (err) {
      notifyError(err);
    } finally {
      setVerifying("");
    }
  }

  async function remove(id) {
    try {
      await api.removeDomain(id);
      setDomains((p) => (p || []).filter((d) => d.id !== id));
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <div className="em-card">
      <div className="em-card-head">
        <h2 className="em-card-title">Domains</h2>
        <p className="em-card-sub">
          Register domains beyond the built-in one. Once a domain is verified, anyone can create
          aliases on it and send and receive mail.
        </p>
      </div>

      {!domains ? (
        <Loader size="sm" />
      ) : (
        <div className="em-alias-list">
          {domains.map((d) => (
            <div key={d.id} className="em-domain-row">
              <div className="em-domain-main">
                <span className="em-alias-addr">{d.domain}</span>
                {d.verified ? (
                  <Badge variant="green" icon={CheckCircle}>
                    receiving
                  </Badge>
                ) : (
                  <Badge variant="neutral" icon={Warning}>
                    no receiving
                  </Badge>
                )}
                {d.sendVerified ? (
                  <Badge variant="green" icon={CheckCircle}>
                    sending
                  </Badge>
                ) : (
                  <Badge variant="neutral" icon={Warning}>
                    no sending
                  </Badge>
                )}
                {d.builtIn && <Badge variant="purple">built-in</Badge>}
              </div>
              {!d.builtIn && (
                <div className="em-alias-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={ShieldCheck}
                    loading={verifying === d.id}
                    onClick={() => verify(d.id)}
                  >
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    shape="square"
                    aria-label="Remove domain"
                    icon={Trash}
                    onClick={() => remove(d.id)}
                  />
                </div>
              )}
              {lookups[d.id] && (
                <div className="em-domain-lookup">
                  <div className="em-dns-check">
                    <span className={lookups[d.id].verified ? "is-ok" : "is-bad"}>
                      {lookups[d.id].verified ? "✓" : "✗"} Receiving (MX, Cloudflare Email Routing)
                    </span>
                    <span className={lookups[d.id].sending?.spf ? "is-ok" : "is-bad"}>
                      {lookups[d.id].sending?.spf ? "✓" : "✗"} SPF record
                    </span>
                    <span className={lookups[d.id].sending?.dkim ? "is-ok" : "is-bad"}>
                      {lookups[d.id].sending?.dkim ? "✓" : "✗"} DKIM record
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form className="em-alias-add" onSubmit={add}>
        <div className="em-alias-input">
          <input
            aria-label="New domain"
            placeholder="example.com"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
          />
        </div>
        <Button type="submit" variant="outline" icon={Plus} loading={busy}>
          Add domain
        </Button>
      </form>
      {error && (
        <div className="em-form-error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}

      <div className="em-dns-steps">
        <div className="em-dns-steps-title">Receiving (inbound)</div>
        <ol>
          <li>Add the domain to the same Cloudflare account that runs this worker.</li>
          <li>
            Open Email, Email Routing and enable it. Cloudflare adds the MX records (route1, route2,
            route3 .mx.cloudflare.net).
          </li>
          <li>
            Under Email Routing, Routing rules, set the catch-all action to Send to a Worker and
            pick estrogen-mail. This delivers all mail for the domain into this app.
          </li>
        </ol>
        <div className="em-dns-steps-title">Sending (outbound)</div>
        <ol>
          <li>
            Open Email, Email Sending and onboard this domain. Cloudflare adds the SPF and DKIM
            records automatically (the DKIM key is generated per domain).
          </li>
          <li>
            If you manage DNS yourself, the SPF record is a TXT on the root:{" "}
            <code>v=spf1 include:_spf.mx.cloudflare.net ~all</code>. The DKIM record is the per-domain
            CNAME/TXT Cloudflare shows during onboarding.
          </li>
          <li>
            Press Verify. Receiving passes once the MX resolves, sending passes once SPF and DKIM
            resolve. You can only send from a domain after sending is verified.
          </li>
        </ol>
      </div>
    </div>
  );
}

export function Admin({ onBack }) {
  const [users, setUsers] = useState(null);

  useEffect(() => {
    api
      .adminUsers()
      .then((d) => setUsers(d.users || []))
      .catch(notifyError);
  }, []);

  return (
    <div className="em-read-pane">
      <div className="em-topbar">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Back
        </Button>
        <span className="em-topbar-title">Admin</span>
      </div>
      <div className="em-section">
        <div className="em-section-inner">
        <h1 className="em-display">Admin</h1>
        <p className="em-section-lede">
          Accounts, groups, and sign-in are managed in hrtID. Anyone you provision there with
          access to this app gets a mailbox here on first sign-in.{" "}
          <Link href="https://id.estrogen.delivery" target="_blank" rel="noreferrer">
            Open hrtID <ArrowSquareOut size={13} />
          </Link>
        </p>

        <div className="em-card">
          <div className="em-card-head">
            <h2 className="em-card-title">Mailboxes</h2>
          </div>
        {!users ? (
          <Loader size="sm" />
        ) : (
          <table className="em-table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Name</th>
                <th>Account email</th>
                <th>Storage</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.address}
                    {u.is_admin ? (
                      <Badge variant="purple" style={{ marginLeft: 6 }}>
                        admin
                      </Badge>
                    ) : null}
                  </td>
                  <td>{u.display_name || "-"}</td>
                  <td>{u.email || "-"}</td>
                  <td>{humanSize(u.storage_used || 0)}</td>
                  <td>{u.last_login ? relativeTime(u.last_login) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>

        <Domains />
        </div>
      </div>
    </div>
  );
}
