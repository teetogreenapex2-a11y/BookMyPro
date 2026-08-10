"use client";

import { useEffect, useRef, useState } from "react";

type Message = { id: string; body: string; createdAt: string; isMine: boolean; senderName: string };

export default function ChatThread({
  apiBase, conversationId, title, backHref,
}: { apiBase: string; conversationId: string; title: string; backHref: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
    // Simple polling rather than a real-time socket connection - genuinely
    // good enough for "arrives within a couple seconds" messaging between
    // a player and their instructor, without the added infrastructure a
    // true live connection would need.
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function load() {
    const res = await fetch(`${apiBase}/conversations/${conversationId}/messages`);
    if (res.ok) setMessages(await res.json());
    setLoading(false);
  }

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    const res = await fetch(`${apiBase}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const sent = await res.json();
      setMessages((prev) => [...prev, { ...sent, senderName: "You" }]);
    } else {
      setDraft(body); // put it back so nothing typed is lost
    }
    setSending(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F6F4EE", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid #E3D9C9", background: "#FFF" }}>
        <a href={backHref} style={{ color: "#1B3A2F", textDecoration: "none", fontSize: 20 }}>&larr;</a>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1B3A2F" }}>{title}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <p style={{ color: "#8A8571", fontSize: 13 }}>Loading...</p>
        ) : messages.length === 0 ? (
          <p style={{ color: "#8A8571", fontSize: 13 }}>No messages yet - say hello.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.isMine ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "75%", padding: "9px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.4,
                background: m.isMine ? "#1B3A2F" : "#FFF", color: m.isMine ? "#F6F4EE" : "#14231C",
                border: m.isMine ? "none" : "1px solid #E3D9C9",
              }}>
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #E3D9C9", background: "#FFF" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Type a message..."
          style={{ flex: 1, border: "1px solid #E3D9C9", borderRadius: 20, padding: "10px 16px", fontSize: 14 }}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 20, padding: "0 20px", fontWeight: 700, fontSize: 14, opacity: sending || !draft.trim() ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
