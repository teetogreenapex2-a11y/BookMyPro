"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { upload } from "@vercel/blob/client";

type Message = { id: string; body: string | null; imageUrl: string | null; createdAt: string; isMine: boolean; senderName: string };

export default function ChatThread({
  apiBase, conversationId, title, backHref,
}: { apiBase: string; conversationId: string; title: string; backHref: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  // The native tab bar sits on top of the page rather than shrinking the
  // space available to it (a deliberate tradeoff made when fixing a real
  // crash earlier), so anything reaching the very bottom of the screen -
  // like this input bar - needs its own extra clearance to avoid getting
  // covered.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    const body = draft.trim();
    setDraft("");
    try {
      const res = await fetch(`${apiBase}/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const sent = await res.json();
        setMessages((prev) => [...prev, { ...sent, senderName: "You" }]);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Send failed (${res.status})`);
        setDraft(body);
      }
    } catch (err: any) {
      setError(err?.message || "Send failed");
      setDraft(body);
    }
    setSending(false);
  }

  // Vercel Blob's client upload finishes once the bytes have landed, but
  // the actual Message row only gets created moments later by a separate
  // background callback from Vercel itself - same reasoning as the retry
  // in loadVideosWithRetry elsewhere in the app. A couple of short,
  // increasing-delay retries here gets the new message to actually show
  // up promptly instead of waiting for the next regular 4-second poll.
  async function sendImage(file: File) {
    setUploadingImage(true);
    setError(null);
    try {
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `${apiBase}/conversations/${conversationId}/messages/upload-token`,
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        await load();
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't send that image");
    }
    setUploadingImage(false);
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
                maxWidth: "75%", padding: m.imageUrl && !m.body ? 4 : "9px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.4,
                background: m.isMine ? "#1B3A2F" : "#FFF", color: m.isMine ? "#F6F4EE" : "#14231C",
                border: m.isMine ? "none" : "1px solid #E3D9C9",
              }}>
                {m.imageUrl && (
                  <img
                    src={m.imageUrl}
                    alt=""
                    style={{ display: "block", maxWidth: "100%", borderRadius: 10, marginBottom: m.body ? 6 : 0 }}
                  />
                )}
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "0 16px" }}>
        {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "6px 0 0" }}>{error}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: `12px 16px ${isNative ? 84 : 12}px`, borderTop: "1px solid #E3D9C9", background: "#FFF" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          title="Send a photo"
          style={{
            flexShrink: 0, width: 42, background: "none", border: "1px solid #E3D9C9", borderRadius: 20,
            fontSize: 18, opacity: uploadingImage ? 0.5 : 1,
          }}
        >
          {uploadingImage ? "…" : "📷"}
        </button>
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
