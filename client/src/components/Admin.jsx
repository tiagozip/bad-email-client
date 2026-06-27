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
      setDomains((p) => (p || []).map((d) => (d.id === id ? { ...d, verified: res.verified } : d)));
      if (res.verified) notify("Domain verified", "Mail will route through this worker.", "success");
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
                    verified
                  </Badge>
                ) : (
                  <Badge variant="neutral" icon={Warning}>
                    unverified
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
                  {lookups[d.id].records.length === 0 ? (
                    <span>No MX records found for this domain.</span>
                  ) : (
                    <ul>
                      {lookups[d.id].records.map((r) => (
                        <li key={`${r.priority}-${r.target}`}>
                          {r.priority} {r.target}
                        </li>
                      ))}
                    </ul>
                  )}
                  <span>
                    {lookups[d.id].verified
                      ? "MX points to Cloudflare Email Routing."
                      : "MX does not point to Cloudflare Email Routing yet."}
                  </span>
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
        <div className="em-dns-steps-title">DNS setup for a new domain</div>
        <ol>
          <li>Add the domain to the same Cloudflare account that runs this worker.</li>
          <li>
            Open Email, Email Routing and enable it. Cloudflare adds the MX records (route1, route2,
            route3 .mx.cloudflare.net) and the SPF record for you.
          </li>
          <li>
            Under Email Routing, Routing rules, set the catch-all action to Send to a Worker and
            pick estrogen-mail. This delivers all mail for the domain into this app.
          </li>
          <li>Come back here and press Verify. It passes once the MX records resolve.</li>
          <li>
            For outbound mail, set up Cloudflare Email Sending and add its DKIM record so messages
            sent from this domain pass DKIM and DMARC.
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
