"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

type ConversationSummary = { id: string; otherName: string; otherRole: string; lastMessageAt: string; lastMessagePreview: string; unreadCount: number };
type StaffMember = { id: string; name: string; role: string };

export default function StaffMessagesInboxClient({ apiBase, basePath }: { apiBase: string; basePath: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDirectory, setShowDirectory] = useState(false);
  const [directory, setDirectory] = useState<StaffMember[]>([]);
  const [starting, setStarting] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    const res = await fetch(`${apiBase}/staff-conversations`);
    if (res.ok) setConversations(await res.json());
    setLoading(false);
  }

  async function openDirectory() {
    const res = await fetch(`${apiBase}/staff-conversations/directory`);
    if (res.ok) setDirectory(await res.json());
    setShowDirectory(true);
  }

  async function startConversation(withMembershipId: string) {
    setStarting(true);
    const res = await fetch(`${apiBase}/staff-conversations/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withMembershipId }),
    });
    setStarting(false);
    if (res.ok) {
      const { id } = await res.json();
      window.location.href = `${basePath}/instructor/staff-messages/${id}`;
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", padding: `20px 20px ${isNative ? 92 : 20}px`, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <a href={`${basePath}/instructor`} style={{ color: "#1B3A2F", textDecoration: "none", fontSize: 20 }}>&larr;</a>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: "#1B3A2F", margin: 0, flex: 1 }}>Staff Messages</h1>
        </div>

        <button
          onClick={openDirectory}
          style={{
            display: "block", width: "100%", background: "#1B3A2F", color: "#F6F4EE", border: "none",
            borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, marginBottom: 20,
          }}
        >
          + New message
        </button>

        {showDirectory && (
          <div style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 10, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Message someone on staff</div>
            {directory.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8A8571", margin: 0 }}>No other staff members yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {directory.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => startConversation(s.id)}
                    disabled={starting}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: "#F6F4EE", border: "none", borderRadius: 8, padding: "9px 12px", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: "#8A8571", textTransform: "capitalize" }}>{s.role}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowDirectory(false)}
              style={{ marginTop: 10, background: "none", border: "none", color: "#8A8571", fontSize: 12.5, padding: 0 }}
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: "#8A8571", fontSize: 13 }}>Loading...</p>
        ) : conversations.length === 0 ? (
          <p style={{ color: "#8A8571", fontSize: 13 }}>No staff conversations yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {conversations.map((c) => (
              <a
                key={c.id}
                href={`${basePath}/instructor/staff-messages/${c.id}`}
                style={{
                  display: "block", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 10,
                  padding: "12px 16px", textDecoration: "none", color: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F" }}>
                    {c.otherName} <span className="mono" style={{ fontSize: 10.5, color: "#8A8571", fontWeight: 500, textTransform: "capitalize" }}>({c.otherRole})</span>
                  </div>
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
