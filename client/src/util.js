export function relativeTime(ms) {
  if (!ms) return "";
  const now = Date.now();
  const diff = now - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function fullDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function humanSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function displayName(person) {
  if (!person) return "";
  return person.name || person.address || "";
}

export function initials(person) {
  const base = (person?.name || person?.address || "?").trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return base.slice(0, 2);
}

const MONO_COLORS = [
  "#bf3264",
  "#c2557e",
  "#8b6fd6",
  "#5a86e6",
  "#3fa8a0",
  "#5f9a52",
  "#c98a30",
  "#d2693f",
];

export function monoColor(seed) {
  const str = String(seed || "");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return MONO_COLORS[h % MONO_COLORS.length];
}

export function recipientLine(list) {
  if (!list?.length) return "";
  return list.map((p) => p.name || p.address).join(", ");
}

export function parseRecipients(raw) {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const URL_RE = /(https?:\/\/[^\s<]+)/g;

export function linkifyParts(text) {
  const out = [];
  let last = 0;
  const str = String(text || "");
  str.replace(URL_RE, (match, _g, offset) => {
    if (offset > last) out.push({ t: "text", v: str.slice(last, offset) });
    out.push({ t: "link", v: match });
    last = offset + match.length;
    return match;
  });
  if (last < str.length) out.push({ t: "text", v: str.slice(last) });
  return out;
}

export const FOLDER_LABELS = {
  inbox: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  spam: "Spam",
  trash: "Trash",
};

const QUOTA = 500 * 1024 * 1024;
export const STORAGE_QUOTA = QUOTA;
