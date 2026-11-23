"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VPage = { path: string; at: string; lastAt: string };
type Visit = {
  id: string; sessionId: string; userId: string; visitorName: string; visitorEmail: string; source: string; city: string; region: string; country: string; referrer: string;
  pages: VPage[]; startedAt: string; lastSeenAt: string;
};
type ChatRow = {
  id: string; sessionId: string; name: string; contact: string; city: string; region: string;
  unread: boolean; lastMessageAt: string; lastText: string; lastFromOwner: boolean;
};
type Msg = { id: string; fromOwner: boolean; text: string; at: string };
type Target = { chatId?: string; sessionId?: string; label: string };

const LIVE_MS = 45 * 1000; // heartbeat is ~15s, so 45s of silence = gone

function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function ago(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
function pretty(path: string) {
  if (path === "/" || path === "") return "Home page";
  const hash = path.match(/#(.+)$/);
  if (hash) return hash[1].replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return path.replace(/^BookMyPro\s*/, "BookMyPro ").replace(/^\//, "");
}
const chatLabel = (c: { name: string; city: string; region: string }) =>
  c.name || [c.city, c.region].filter(Boolean).join(", ") || "Visitor";

function ChatPanel({ apiBase, target, onClose, onChanged }: { apiBase: string; target: Target; onClose: () => void; onChanged: () => void }) {
  const [chatId, setChatId] = useState<string | undefined>(target.chatId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [info, setInfo] = useState<{ name: string; contact: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setChatId(target.chatId); setMessages([]); setInfo(null); setError(""); }, [target.chatId, target.sessionId]);

  const load = useCallback(async () => {
    if (!chatId) return;
    try {
      const res = await fetch(`${apiBase}/chat?id=${chatId}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setMessages(d.messages || []);
      setInfo(d.chat ? { name: d.chat.name, contact: d.chat.contact } : null);
    } catch {}
  }, [apiBase, chatId]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatId ? { id: chatId, text: t } : { sessionId: target.sessionId, text: t }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setChatId(d.chatId || chatId);
        setMessages((m) => [...m, d.message]);
        setText("");
        onChanged();
      } else setError(d.error || "Couldn't send.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ background: "#fff", border: "2px solid #1E6B3A", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>Chat with {info?.name || target.label}</strong>
        {info?.contact ? <span style={{ fontSize: 13, color: "#4A5147" }}>· {info.contact}</span> : null}
        <button onClick={onClose} style={{ marginLeft: "auto", all: "unset", cursor: "pointer", fontSize: 13, color: "#4A5147" }}>Close ✕</button>
      </div>
      <div style={{ display: "grid", gap: 8, maxHeight: "40vh", overflowY: "auto", paddingRight: 4, minHeight: 40 }}>
        {messages.length === 0 && <p style={{ fontSize: 13.5, color: "#4A5147", margin: 0 }}>Say hello — they&apos;ll see it in the chat bubble on your website right away.</p>}
        {messages.map((m) => (
          <div key={m.id} style={{
            justifySelf: m.fromOwner ? "end" : "start", maxWidth: "82%", padding: "8px 12px", borderRadius: 14,
            background: m.fromOwner ? "#1E6B3A" : "#EEF0EC", color: m.fromOwner ? "#fff" : "#1c2a20",
            fontSize: 14.5, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{m.text}</div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p style={{ color: "#B3261E", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…"
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          style={{ flex: 1, minWidth: 0, fontSize: 16, padding: "10px 12px", borderRadius: 10, border: "1px solid #C9CFC6" }} />
        <button onClick={send} disabled={busy || !text.trim()} style={{
          border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 700, color: "#fff",
          background: "#1E6B3A", opacity: busy || !text.trim() ? 0.5 : 1, cursor: "pointer",
        }}>Send</button>
      </div>
    </div>
  );
}

export default function VisitorsClient({ basePath, apiBase }: { basePath: string; apiBase: string }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatOn, setChatOn] = useState(false);
  const [serverNow, setServerNow] = useState<number>(Date.now());
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState("");
  const panelTop = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/visitors?days=${days}`, { cache: "no-store" });
      if (!res.ok) { setError("Couldn't load visitors."); return; }
      const data = await res.json();
      setVisits(data.visits || []);
      setServerNow(new Date(data.now).getTime());
      setError("");
    } catch { setError("Couldn't load visitors."); }
    finally { setLoading(false); }
  }, [apiBase, days]);

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/chat`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setChatOn(!!d.enabled);
      setChats(d.chats || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    load(); loadChats();
    const t = setInterval(() => { if (document.visibilityState === "visible") { load(); loadChats(); } }, 8000);
    return () => clearInterval(t);
  }, [load, loadChats]);

  // Opened from a chat alert (?c=...)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setTarget({ chatId: c, label: "visitor" });
  }, []);

  async function toggleChat() {
    const next = !chatOn;
    setChatOn(next);
    const res = await fetch(`${apiBase}/chat`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) { setChatOn(!next); setError("Couldn't change the chat setting."); }
  }

  function scrollToPanel() { setTimeout(() => panelTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
  function openFor(v: Visit, where: string) {
    const existing = chats.find((c) => c.sessionId === v.sessionId);
    setTarget(existing ? { chatId: existing.id, label: where } : { sessionId: v.sessionId, label: where });
    scrollToPanel();
  }

  const live = visits.filter((v) => serverNow - new Date(v.lastSeenAt).getTime() < LIVE_MS);
  const chatBy = new Map(chats.map((c) => [c.sessionId, c]));
  const unread = chats.filter((c) => c.unread).length;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 90px", color: "var(--ink, #1c2a20)" }}>
      <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#4A5147", textDecoration: "none" }}>← Dashboard</a>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 4px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Visitors</h1>
        <button onClick={toggleChat} aria-pressed={chatOn} style={{
          marginLeft: "auto", cursor: "pointer", border: "none", borderRadius: 999, padding: "8px 14px",
          fontSize: 13.5, fontWeight: 700, color: "#fff", background: chatOn ? "#2E9E52" : "#7A8178",
        }}>
          Website chat {chatOn ? "ON" : "OFF"} · tap to turn {chatOn ? "off" : "on"}
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: "#4A5147", margin: "0 0 14px" }}>
        People on your website and booking pages who aren&apos;t signed in. Tap <strong>Chat</strong> on anyone to message them. Updates every few seconds.
      </p>

      <div ref={panelTop} />
      {target && <ChatPanel apiBase={apiBase} target={target} onClose={() => setTarget(null)} onChanged={loadChats} />}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 13, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
          background: live.length ? "#E3F2E7" : "#EEF0EC", color: live.length ? "#1E6B3A" : "#4A5147",
        }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", marginRight: 6, background: live.length ? "#2E9E52" : "#A9B0A6" }} />
          {live.length} on right now
        </span>
        <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
          style={{ marginLeft: "auto", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: "1px solid #C9CFC6", background: "#fff" }}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {chats.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Messages{unread > 0 ? ` · ${unread} waiting` : ""}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {chats.slice(0, 8).map((c) => (
              <button key={c.id} onClick={() => { setTarget({ chatId: c.id, label: chatLabel(c) }); scrollToPanel(); }} style={{
                all: "unset", cursor: "pointer", display: "block", background: "#fff",
                border: `1px solid ${c.unread ? "#2E9E52" : "#DDE2DA"}`, borderRadius: 12, padding: "10px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {c.unread && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2E9E52", flex: "none" }} />}
                  <strong style={{ fontSize: 14.5 }}>{chatLabel(c)}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#4A5147" }}>{ago(serverNow - new Date(c.lastMessageAt).getTime())}</span>
                </div>
                <div style={{ fontSize: 13.5, color: "#4A5147", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.lastFromOwner ? "You: " : ""}{c.lastText}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ color: "#B3261E", fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ fontSize: 13.5, color: "#4A5147" }}>Loading…</p>}
      {!loading && visits.length === 0 && (
        <p style={{ fontSize: 14, color: "#4A5147" }}>No visitors yet in this period. They&apos;ll show up here as soon as someone opens your site.</p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {visits.map((v) => {
          const isLive = serverNow - new Date(v.lastSeenAt).getTime() < LIVE_MS;
          const started = new Date(v.startedAt).getTime();
          const total = new Date(v.lastSeenAt).getTime() - started;
          const where = [v.city, v.region || v.country].filter(Boolean).join(", ") || "Unknown location";
          let from = "";
          try { if (v.referrer) from = new URL(v.referrer).hostname.replace(/^www\./, ""); } catch {}
          const isOpen = open === v.id;
          const chat = chatBy.get(v.sessionId);
          return (
            <div key={v.id} style={{ background: "#fff", border: "1px solid #DDE2DA", borderRadius: 12, padding: "12px 14px" }}>
              <button onClick={() => setOpen(isOpen ? null : v.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: isLive ? "#2E9E52" : "#B9BFB6", flex: "none" }} />
                  <strong style={{ fontSize: 15 }}>{v.userId ? (v.visitorName || v.visitorEmail || where) : where}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#4A5147" }}>
                    {isLive ? "On now" : ago(serverNow - new Date(v.lastSeenAt).getTime())}
                  </span>
                </div>
                {v.userId && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <span style={{ background: "#FFF1D6", color: "#7A4E00", padding: "2px 8px", borderRadius: 999, fontWeight: 700, fontSize: 12 }}>Has an account · not a customer yet</span>
                    {v.visitorEmail ? <span style={{ color: "#4A5147" }}> {v.visitorEmail}</span> : null}
                  </div>
                )}
                <div style={{ fontSize: 13, color: "#4A5147", marginTop: 4 }}>
                  {where}{" · "}{v.pages.length} {v.pages.length === 1 ? "page" : "pages"} · {dur(total)} on site
                  {from ? ` · from ${from}` : ""}{v.source === "bookmypro" ? " · booking pages" : ""}
                </div>
              </button>
              {chatOn && v.source === "website" && (isLive || chat) && (
                <button onClick={() => openFor(v, where)} style={{
                  marginTop: 8, cursor: "pointer", border: "none", borderRadius: 999, padding: "6px 14px",
                  fontSize: 13, fontWeight: 700, color: "#fff", background: chat?.unread ? "#2E9E52" : "#1E6B3A",
                }}>
                  {chat ? (chat.unread ? "Chat · new message" : "Open chat") : "Chat"}
                </button>
              )}
              {isOpen && (
                <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
                  {v.pages.map((p, i) => (
                    <li key={i}>
                      {pretty(p.path)} <span style={{ color: "#4A5147" }}>· {dur(new Date(p.lastAt).getTime() - new Date(p.at).getTime())}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
