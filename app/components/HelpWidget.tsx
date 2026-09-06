"use client";

import { useState } from "react";

// A simple, floating "Help" button and question panel - genuinely just
// answers questions and points someone to the right screen, it never
// takes any action on their behalf. One question and answer at a time,
// no ongoing conversation history kept between questions.
export default function HelpWidget({ apiBase }: { apiBase: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setAnswer(null);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/support/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (res.ok) {
        setAnswer(data.answer);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Couldn't reach support - check your connection and try again.");
    } finally {
      setAsking(false);
    }
  }

  function askAnother() {
    setQuestion("");
    setAnswer(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 150,
          background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 999,
          padding: "12px 18px", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 16 }}>?</span> Help
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,28,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 150 }}>
      <div style={{ background: "#FFF", borderRadius: "16px 16px 0 0", padding: 20, maxWidth: 420, width: "100%", maxHeight: "70vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1B3A2F" }}>Ask a question</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", fontSize: 18, color: "#8A8571", padding: 4 }}>✕</button>
        </div>

        {answer ? (
          <div>
            <p style={{ fontSize: 14, color: "#14231C", lineHeight: 1.5, whiteSpace: "pre-wrap", background: "#F6F4EE", borderRadius: 10, padding: "10px 12px" }}>
              {answer}
            </p>
            <button
              onClick={askAnother}
              style={{ marginTop: 10, background: "none", color: "#1B3A2F", border: "1px solid #E3D9C9", borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13 }}
            >
              Ask another question
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="How do I...?"
              rows={3}
              maxLength={500}
              style={{ width: "100%", border: "1px solid #E3D9C9", borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, resize: "none" }}
            />
            {error && <p style={{ fontSize: 12.5, color: "#B23A3A", margin: "8px 0 0" }}>{error}</p>}
            <button
              onClick={ask}
              disabled={!question.trim() || asking}
              style={{
                marginTop: 10, width: "100%", background: "#1B3A2F", color: "#F6F4EE", border: "none",
                borderRadius: 8, padding: "11px 16px", fontWeight: 700, fontSize: 14,
                opacity: !question.trim() || asking ? 0.6 : 1,
              }}
            >
              {asking ? "Asking…" : "Ask"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
