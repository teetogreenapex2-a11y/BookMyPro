"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatRow = {
  id: string; name: string; contact: string; city: string; region: string;
  unread: boolean; lastMessageAt: string; lastText: string; lastFromOwner: boolean;
};
type Msg = { id: string; fromOwner: boolean; text: string; at: string };

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
const label = (c: { name: string; city: string; region: string }) =>
  c.name || [c.city, c.region].filter(Boolean).join(", ") || "Visitor";

export default function ChatClient({ basePath, apiBase }: { basePath: string; apiBase: string }) {
  const [enabled, setEnabled] = useState(false);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chat, setChat] = useState<{ name: string; contact: string; city: string; region: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Open a chat straight from a push alert (?c=...)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setOpenId(c);
  }, []);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/chat`, { cache: "no-store" });
      if (!res.ok) { setError("Couldn't load chats."); return; }
      const d = await res.json();
      setEnabled(!!d.enabled);
      setChats(d.chats || []);
      setError("");
    } catch { setError("Couldn't load chats."); }
    finally { setLoading(false); }
  }, [apiBase]);

  const loadChat = useCallback(async () => {
    if (!openId) return;
    try {
      const res = await fetch(`${apiBase}/chat?id=${openId}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json();
      setChat(d.chat);
      setMessages(d.messages || []);
    } catch {}
  }, [apiBase, openId]);

  useEffect(() => {
    loadList();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadList(); }, 6000);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!openId) { setChat(null); setMessages([]); return; }
    loadChat();
    const t = setInterval(() => { if (document.visibilityState === "visible") loadChat(); }, 4000);
    return () => clearInterval(t);
  }, [openId, loadChat]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, openId]);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    const res = await fetch(`${apiBase}/chat`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) { setEnabled(!next); setError("Couldn't change the setting."); }
  }

  async function send() {
    const t = text.trim();
    if (!t || !openId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openId, text: t }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages((m) => [...m, d.message]);
        setText("");
        loadList();
      } else setError("Couldn't send.");
    } finally { setBusy(false); }
  }

  const unreadCount = chats.filter((c) => c.unread).length;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 90px", color: "var(--ink, #1c2a20)" }}>
      <a href={openId ? "#" : `${basePath}/instructor`}
        onClick={(e) => { if (openId) { e.preventDefault(); setOpenId(null); } }}
        style={{ fontSize: 13, color: "#4A5147", textDecoration: "none" }}>
        {openId ? "← All chats" : "← Dashboard"}
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 4px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Website chat</h1>
        <button onClick={toggle} aria-pressed={enabled} style={{
          marginLeft: "auto", cursor: "pointer", border: "none", borderRadius: 999, padding: "8px 16px",
          fontSize: 14, fontWeight: 700, color: "#fff", background: enabled ? "#2E9E52" : "#7A8178",
        }}>
          Chat is {enabled ? "ON" : "OFF"} · tap to turn {enabled ? "off" : "on"}
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: "#4A5147", margin: "0 0 14px" }}>
        {enabled
          ? "The chat bubble is showing on teetogreenapex.com. You get an alert for each new message."
          : "The chat bubble is hidden on your website. Turn it on when you're ready for messages."}
        {unreadCount > 0 ? ` ${unreadCount} waiting for a reply.` : ""}
      </p>
      {error && <p style={{ color: "#B3261E", fontSize: 13 }}>{error}</p>}

      {!openId && (
        <>
          {loading && <p style={{ fontSize: 13.5, color: "#4A5147" }}>Loading…</p>}
          {!loading && chats.length === 0 && (
            <p style={{ fontSize: 14, color: "#4A5147" }}>No chats yet. They&apos;ll show up here when a visitor writes to you.</p>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {chats.map((c) => (
              <button key={c.id} onClick={() => setOpenId(c.id)} style={{
                all: "unset", cursor: "pointer", display: "block", background: "#fff",
                border: `1px solid ${c.unread ? "#2E9E52" : "#DDE2DA"}`, borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {c.unread && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2E9E52", flex: "none" }} />}
                  <strong style={{ fontSize: 15 }}>{label(c)}</strong>
                  <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#4A5147" }}>{ago(c.lastMessageAt)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: "#4A5147", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.lastFromOwner ? "You: " : ""}{c.lastText}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {openId && (
        <div style={{ background: "#fff", border: "1px solid #DDE2DA", borderRadius: 12, padding: 14 }}>
          {chat && (
            <div style={{ fontSize: 13.5, color: "#4A5147", marginBottom: 10 }}>
              <strong style={{ color: "inherit" }}>{label(chat)}</strong>
              {chat.contact ? ` · ${chat.contact}` : ""}
              {chat.city ? ` · ${[chat.city, chat.region].filter(Boolean).join(", ")}` : ""}
            </div>
          )}
          <div style={{ display: "grid", gap: 8, maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
            {messages.map((m) => (
              <div key={m.id} style={{
                justifySelf: m.fromOwner ? "end" : "start", maxWidth: "82%", padding: "8px 12px", borderRadius: 14,
                background: m.fromOwner ? "#1E6B3A" : "#EEF0EC", color: m.fromOwner ? "#fff" : "#1c2a20",
                fontSize: 14.5, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{m.text}</div>
            ))}
            <div ref={endRef} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply…"
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              style={{ flex: 1, fontSize: 16, padding: "10px 12px", borderRadius: 10, border: "1px solid #C9CFC6" }} />
            <button onClick={send} disabled={busy || !text.trim()} style={{
              border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 700, color: "#fff",
              background: "#1E6B3A", opacity: busy || !text.trim() ? 0.5 : 1, cursor: "pointer",
            }}>Send</button>
          </div>
          <p style={{ fontSize: 12, color: "#4A5147", margin: "8px 0 0" }}>
            The visitor sees your reply only while they still have your website open. If they left a phone or email, you can reach them there.
          </p>
        </div>
      )}
    </div>
  );
}
