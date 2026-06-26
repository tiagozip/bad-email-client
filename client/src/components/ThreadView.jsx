import { Button, DropdownMenu, Loader, Tooltip } from "@cloudflare/kumo";
import {
  Archive,
  ArrowBendUpLeft,
  ArrowBendDoubleUpLeft,
  ArrowLeft,
  ArrowRight,
  DotsThree,
  DownloadSimple,
  Envelope,
  Image,
  Star,
  Trash,
  Tray,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { notifyError } from "../toast.js";
import { FOLDER_LABELS, fullDate, humanSize, initials, linkifyParts, monoColor, recipientLine, relativeTime } from "../util.js";

const CSP_STRICT =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:";
const CSP_LOOSE = "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:";

function buildSrcdoc(html, allowRemote) {
  const csp = allowRemote ? CSP_LOOSE : CSP_STRICT;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;padding:0;color:#1c0f16;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;word-break:break-word;}img{max-width:100%;height:auto;}a{color:#bf3264;}</style></head><body>${html}</body></html>`;
}

function HtmlBody({ html, allowRemote }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(240);

  function resize() {
    const f = ref.current;
    if (!f?.contentDocument) return;
    const h = f.contentDocument.documentElement.scrollHeight;
    if (h) setHeight(h + 8);
  }

  useEffect(() => {
    function onResize() {
      resize();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <iframe
      ref={ref}
      className="em-iframe"
      title="message"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={buildSrcdoc(html, allowRemote)}
      style={{ height }}
      onLoad={resize}
    />
  );
}

function PlainBody({ text }) {
  return (
    <div className="em-text-body">
      {linkifyParts(text).map((p, i) =>
        p.t === "link" ? (
          <a key={i} href={p.v} target="_blank" rel="noopener noreferrer">
            {p.v}
          </a>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      )}
    </div>
  );
}

function MessageCard({ message, expanded, onToggle, onShowImages }) {
  const remoteShown = message._imagesShown;
  const hasRemoteRisk = message.hasHtml && message.bodyHtml;
  const seed = message.from?.address || message.from?.name;
  return (
    <div className={`em-msg${expanded ? "" : " is-collapsed"}`}>
      <div className="em-msg-head" onClick={onToggle}>
        <span className="em-avatar" style={{ background: monoColor(seed) }}>
          {initials(message.from)}
        </span>
        <div className="em-msg-head-main">
          <div className="em-msg-from">
            {message.from?.name || message.from?.address}
            {message.from?.name && (
              <span className="em-msg-from-addr"> &lt;{message.from?.address}&gt;</span>
            )}
          </div>
          {expanded ? (
            <div className="em-msg-to">
              to {recipientLine(message.to) || "(no recipient)"}
              {message.cc?.length > 0 && `, cc ${recipientLine(message.cc)}`}
            </div>
          ) : (
            <div className="em-msg-collapsed-snip">{message.snippet}</div>
          )}
        </div>
        <Tooltip content={fullDate(message.date)}>
          <span className="em-msg-date">{relativeTime(message.date)}</span>
        </Tooltip>
      </div>

      {expanded && (
        <div className="em-msg-body">
          {hasRemoteRisk && !remoteShown && (
            <div className="em-images-bar">
              <Image size={16} />
              <span style={{ flex: 1 }}>Remote images are blocked.</span>
              <Button size="sm" variant="outline" onClick={onShowImages}>
                Show images
              </Button>
            </div>
          )}
          {message.bodyHtml ? (
            <HtmlBody html={message.bodyHtml} allowRemote={!!remoteShown} />
          ) : (
            <PlainBody text={message.bodyText} />
          )}
          {message.attachments?.length > 0 && (
            <div className="em-att-row">
              {message.attachments.map((a) => (
                <a
                  key={a.id}
                  className="em-att-chip"
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <DownloadSimple size={14} />
                  {a.filename}
                  <span className="em-att-size">{humanSize(a.size)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BackBar({ onBack, label }) {
  return (
    <div className="em-reader-topbar">
      <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
        {label}
      </Button>
    </div>
  );
}

export function ThreadView({ store, onReply, onForward, onBack }) {
  const { thread, threadLoading, openId, view, messages, toggleStar, moveMessage, setReadState, deleteForever, setThread } =
    store;
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const listItem = messages.find((m) => m.id === openId);
  const backLabel = FOLDER_LABELS[view?.folder] || (view?.kind === "starred" ? "Starred" : view?.name) || "Back";

  useEffect(() => {
    if (thread?.messages?.length) {
      const last = thread.messages[thread.messages.length - 1];
      setExpandedIds(new Set([last.id]));
    }
  }, [thread]);

  if (!openId) {
    return (
      <div className="em-pane em-pane-reader">
        <div className="em-empty">
          <Tray className="em-empty-icon" size={38} weight="thin" />
          <div className="em-empty-title">No message selected</div>
          <div className="em-empty-sub">Pick a message from the list to read it here.</div>
        </div>
      </div>
    );
  }

  if (threadLoading || !thread) {
    return (
      <div className="em-pane em-pane-reader">
        <BackBar onBack={onBack} label={backLabel} />
        <div className="em-center">
          <Loader />
        </div>
      </div>
    );
  }

  const msgs = thread.messages;
  const subject = msgs[0]?.subject || "(no subject)";
  const last = msgs[msgs.length - 1];
  const inTrash = listItem?.folder === "trash";

  function toggle(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function showImages(m) {
    try {
      const data = await api.message(m.id, true);
      setThread({
        threadId: thread.threadId,
        messages: msgs.map((x) => (x.id === m.id ? { ...data.message, _imagesShown: true } : x)),
      });
    } catch (e) {
      notifyError(e);
    }
  }

  const headerItem = listItem || {
    id: openId,
    folder: last?.folder,
    isStarred: last?.isStarred,
    isRead: true,
    threadId: thread.threadId,
  };

  return (
    <div className="em-pane em-pane-reader">
      <div className="em-reader-topbar">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          {backLabel}
        </Button>
        <div className="em-spacer" />
        <Button size="sm" variant="ghost" icon={ArrowBendUpLeft} onClick={() => onReply(last, "reply")}>
          Reply
        </Button>
        <Button size="sm" variant="ghost" icon={ArrowBendDoubleUpLeft} onClick={() => onReply(last, "replyAll")}>
          Reply all
        </Button>
        <Button size="sm" variant="ghost" icon={ArrowRight} onClick={() => onForward(last)}>
          Forward
        </Button>
        <div className="em-spacer" />
        <Tooltip content={headerItem.isStarred ? "Unstar" : "Star"}>
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Star"
            icon={Star}
            onClick={() => toggleStar(headerItem)}
          />
        </Tooltip>
        <Tooltip content="Archive">
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Archive"
            icon={Archive}
            onClick={() => moveMessage(headerItem, "archive")}
          />
        </Tooltip>
        <Tooltip content="Trash">
          <Button
            size="sm"
            variant="ghost"
            shape="square"
            aria-label="Trash"
            icon={Trash}
            onClick={() => moveMessage(headerItem, "trash")}
          />
        </Tooltip>
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={(p) => (
              <Button {...p} size="sm" variant="ghost" shape="square" aria-label="More" icon={DotsThree} />
            )}
          />
          <DropdownMenu.Content>
            <DropdownMenu.Item icon={Envelope} onClick={() => setReadState(headerItem, false)}>
              Mark unread
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={Warning} onClick={() => moveMessage(headerItem, "spam")}>
              Move to spam
            </DropdownMenu.Item>
            <DropdownMenu.Item icon={Tray} onClick={() => moveMessage(headerItem, "inbox")}>
              Move to inbox
            </DropdownMenu.Item>
            {inTrash && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item icon={Trash} variant="danger" onClick={() => deleteForever(headerItem)}>
                  Delete permanently
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>

      <div className="em-thread">
        <div className="em-thread-inner">
          <h1 className="em-thread-subject">{subject}</h1>
          {msgs.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              expanded={expandedIds.has(m.id)}
              onToggle={() => toggle(m.id)}
              onShowImages={() => showImages(m)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
