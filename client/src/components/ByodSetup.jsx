import { Button, Input } from "@cloudflare/kumo";
import { CaretDown, Check, Copy, X } from "@phosphor-icons/react";
import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import { notify } from "../toast.js";

const ByodCode = lazy(() => import("./ByodCode.jsx"));

function CopyField({ label, value, mono }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="em-byod-field">
      {label && <label className="em-field-label">{label}</label>}
      <div className="em-byod-copyrow">
        <code className={mono ? "em-byod-code" : "em-byod-val"}>{value}</code>
        <Button
          size="sm"
          variant="ghost"
          shape="square"
          aria-label="Copy"
          icon={copied ? Check : Copy}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        />
      </div>
    </div>
  );
}

export function ByodSetup({ open, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [created, setCreated] = useState(null);
  const [relayUrl, setRelayUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);

  function reset() {
    setStep(1);
    setDomain("");
    setCreated(null);
    setRelayUrl("");
    setError("");
    setShowManual(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function add() {
    const d = domain.trim().toLowerCase();
    if (!d) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.addByodDomain(d);
      setCreated(res);
      setStep(2);
    } catch (e) {
      setError(e.message || "could not add domain");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      await api.setupRelay(created.id, relayUrl.trim());
      notify("Domain connected", `${created.domain} is ready to send and receive.`, "success");
      onDone?.();
      close();
    } catch (e) {
      setError(e.message || "verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return createPortal(
    <div
      className="em-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="em-modal-panel em-setup-dialog">
        <div className="em-setup-progress">Step {step} of 3</div>
        <div className="em-setup-steps">
          <div className={`em-setup-step ${step >= 1 ? "active" : ""}`} />
          <div className={`em-setup-step ${step >= 2 ? "active" : ""}`} />
          <div className={`em-setup-step ${step >= 3 ? "active" : ""}`} />
        </div>
        <div className="em-label-head">
          <h2 className="em-label-title">Bring your own domain</h2>
          <Button size="sm" variant="ghost" shape="square" aria-label="Close" icon={X} onClick={close} />
        </div>

        {step === 1 && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              Use a domain on <strong>your own</strong> Cloudflare account. You'll deploy a tiny relay
              Worker that bridges it to your mailbox here, for both sending and receiving. Nothing
              leaves your account.
            </p>
            <Input
              autoFocus
              label="Domain"
              placeholder="example.com"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setError("");
              }}
            />
            {error && <div className="em-form-error">{error}</div>}
            <Button variant="primary" loading={busy} onClick={add}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && created && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              On <strong>your</strong> Cloudflare account: prove ownership, deploy the relay with one
              click, then turn on Email Routing and Email Sending for <strong>{created.domain}</strong>.
            </p>

            <div className="em-byod-block">
              <div className="em-byod-block-title">1. Prove you own it — add this DNS TXT record</div>
              <CopyField label={`_estrogen.${created.domain}`} value={created.verifyToken} mono />
            </div>

            <div className="em-byod-block">
              <div className="em-byod-block-title">2. Deploy the relay Worker</div>
              <p className="em-byod-hint">
                One click clones the Worker into your account. When it asks for{" "}
                <code className="em-inline-code">RELAY_CONFIG</code>, paste the single value below.
                That's the only thing to set.
              </p>
              <a className="em-byod-deploy" href={created.deployUrl} target="_blank" rel="noreferrer">
                <img
                  src="https://deploy.workers.cloudflare.com/button"
                  alt="Deploy to Cloudflare"
                  height={32}
                />
              </a>
              <CopyField label="RELAY_CONFIG" value={created.relayConfig} mono />

              <button
                type="button"
                className={`em-byod-disclosure ${showManual ? "open" : ""}`}
                onClick={() => setShowManual((v) => !v)}
              >
                <CaretDown weight="bold" />
                Prefer to do it by hand? Show the Worker code
              </button>
              {showManual && (
                <Suspense fallback={<div className="em-byod-hint">Loading code…</div>}>
                  <ByodCode code={created.relayCode} />
                </Suspense>
              )}
            </div>

            <div className="em-byod-block">
              <div className="em-byod-block-title">3. Wire it up</div>
              <p className="em-byod-hint">
                In the Cloudflare dashboard for {created.domain}: set the Email Routing catch-all to
                send to your new Worker, and enable Email Sending for the domain (so it can send with
                DKIM). Then continue.
              </p>
            </div>

            {error && <div className="em-form-error">{error}</div>}
            <Button variant="primary" onClick={() => setStep(3)}>
              I've deployed it
            </Button>
          </div>
        )}

        {step === 3 && created && (
          <div className="em-setup-body">
            <p className="em-card-sub">
              Paste your relay Worker's URL. We'll check the ownership record and do a signed
              handshake with your relay.
            </p>
            <Input
              autoFocus
              label="Relay Worker URL"
              placeholder="https://estrogen-mail-relay.your-subdomain.workers.dev"
              value={relayUrl}
              onChange={(e) => {
                setRelayUrl(e.target.value);
                setError("");
              }}
            />
            {error && <div className="em-form-error">{error}</div>}
            <div className="em-byod-actions">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" loading={busy} onClick={verify}>
                Connect domain
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
