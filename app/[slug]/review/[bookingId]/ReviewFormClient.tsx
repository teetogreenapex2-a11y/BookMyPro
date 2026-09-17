"use client";

import { useState } from "react";

export default function ReviewFormClient({
  slug,
  apiBase,
  basePath,
  bookingId,
  instructorName,
  businessName,
}: {
  slug: string;
  apiBase: string;
  basePath: string;
  bookingId: string;
  instructorName: string;
  businessName: string;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (rating < 1) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`${apiBase}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, rating, text }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong.");
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: "#1B3A2F", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "32px 28px", maxWidth: 400, width: "100%", textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#1B3A2F", margin: "0 0 6px" }}>Thanks for the review!</p>
          <p style={{ fontSize: 13, color: "#5C6459", margin: 0 }}>It helps other players find {instructorName}.</p>
          <a href={basePath} style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "#B8862B", fontWeight: 700, textDecoration: "none" }}>
            Back to BookMyPro
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1B3A2F", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "32px 28px", maxWidth: 420, width: "100%" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#B8862B", margin: "0 0 6px", textTransform: "uppercase" }}>
          {businessName}
        </p>
        <h1 style={{ fontSize: 20, margin: "0 0 6px", color: "#1B3A2F" }}>How was your lesson with {instructorName}?</h1>
        <p style={{ fontSize: 13, color: "#5C6459", margin: "0 0 20px" }}>Your rating helps other players find the right instructor.</p>

        <div style={{ display: "flex", gap: 6, marginBottom: 18, justifyContent: "center" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              style={{ background: "none", border: "none", fontSize: 34, cursor: "pointer", padding: 2, lineHeight: 1 }}
            >
              <span style={{ color: (hoverRating || rating) >= n ? "#B8862B" : "#DCD6C4" }}>&#9733;</span>
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Anything you'd like to add? (optional)"
          rows={4}
          style={{
            width: "100%", boxSizing: "border-box", border: "1px solid #E3D9C9", borderRadius: 8, padding: 10,
            fontSize: 13, marginBottom: 14, resize: "vertical", fontFamily: "inherit",
          }}
        />

        {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}

        <button
          onClick={submit}
          disabled={rating < 1 || submitting}
          style={{
            width: "100%", background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8,
            padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: rating < 1 ? "default" : "pointer",
            opacity: rating < 1 || submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>
      </div>
    </div>
  );
}
