import { Button, Loader } from "@cloudflare/kumo";
import { ArrowLeft, ClockCountdown, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { fullDate, recipientLine } from "../util.js";

function toLine(to) {
  if (!to?.length) return "(no recipient)";
  if (typeof to[0] === "string") return to.join(", ");
  return recipientLine(to);
}

export function ScheduledView({ onBack }) {
  const [sends, setSends] = useState(null);

  useEffect(() => {
    api
      .scheduledSends()
      .then((d) => setSends(d.sends || []))
      .catch(notifyError);
  }, []);

  async function cancel(id) {
    try {
      await api.cancelScheduled(id);
      setSends((p) => (p || []).filter((s) => s.id !== id));
    } catch (e) {
      notifyError(e);
    }
  }

  return (
    <div className="em-read-pane">
      <div className="em-topbar">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          Back
        </Button>
        <span className="em-topbar-title">Scheduled</span>
      </div>
      <div className="em-section">
        <div className="em-section-inner">
          <h1 className="em-display">Scheduled</h1>
          <p className="em-section-lede">
            Messages waiting to be sent later. Cancel one to stop it from going out.
          </p>

          {!sends ? (
            <Loader size="sm" />
          ) : sends.length === 0 ? (
            <div className="em-empty">
              <ClockCountdown className="em-empty-icon" size={38} weight="thin" />
              <div className="em-empty-title">No scheduled messages.</div>
            </div>
          ) : (
            <div className="em-card">
              <div className="em-sched-list">
                {sends.map((s) => (
                  <div key={s.id} className="em-sched-row">
                    <div className="em-sched-main">
                      <div className="em-sched-to">{toLine(s.to)}</div>
                      <div className="em-sched-subject">{s.subject || "(no subject)"}</div>
                    </div>
                    <div className="em-sched-when">{fullDate(s.sendAt)}</div>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => cancel(s.id)}>
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
