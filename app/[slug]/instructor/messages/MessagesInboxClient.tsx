"use client";

import { useEffect, useState } from "react";

type ConversationSummary = { id: string; playerName: string; lastMessageAt: string; lastMessagePreview: string; unreadCount: number };

export default function MessagesInboxClient({ apiBase, basePath }: { apiBase: string; basePath: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    const res = await fetch(`${apiBase}/conversations`);
    if (res.ok) setConversations(await res.json());
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", padding: 20, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <a href={`${basePath}/instructor`} style={{ color: "#1B3A2F", textDecoration: "none", fontSize: 20 }}>&larr;</a>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: "#1B3A2F", margin: 0 }}>Messages</h1>
        </div>

        {loading ? (
          <p style={{ color: "#8A8571", fontSize: 13 }}>Loading...</p>
        ) : conversations.length === 0 ? (
          <p style={{ color: "#8A8571", fontSize: 13 }}>No conversations yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversations.map((c) => (
              <a
                key={c.id}
                href={`${basePath}/instructor/messages/${c.id}`}
                style={{
                  display: "block", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 10,
                  padding: "12px 16px", textDecoration: "none", color: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F" }}>{c.playerName}</div>
                  {c.unreadCount > 0 && (
                    <div style={{ background: "#B8862B", color: "#FFF", borderRadius: 10, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                      {c.unreadCount}
                    </div>
                  )}
                </div>
                {c.lastMessagePreview && (
                  <div style={{ fontSize: 13, color: "#5C6459", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.lastMessagePreview}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
