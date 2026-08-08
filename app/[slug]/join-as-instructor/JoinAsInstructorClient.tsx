"use client";

import { useState } from "react";

export default function JoinAsInstructorClient({
  slug, businessName, apiBase, defaultName, defaultEmail, alreadyPending,
}: { slug: string; businessName: string; apiBase: string; defaultName: string; defaultEmail: string; alreadyPending: boolean }) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadyPending);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError("Name, email, and phone are all required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/join-as-instructor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong submitting your request.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', sans-serif", background: "#1B3A2F" }}>
      <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "36px 32px", maxWidth: 420, width: "100%" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 14, textAlign: "center" }}>BOOKMYPRO</div>

        {submitted ? (
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, marginBottom: 12, color: "#1B3A2F" }}>Request sent</h1>
            <p style={{ fontSize: 14, color: "#5C6459", lineHeight: 1.6 }}>
              {businessName} has been notified of your request to join as an instructor. You'll get access once they approve it — no need to do anything else for now.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, marginBottom: 6, color: "#1B3A2F", textAlign: "center" }}>
              Join {businessName}
            </h1>
            <p style={{ fontSize: 13, color: "#5C6459", textAlign: "center", marginBottom: 22 }}>
              Tell us a bit about yourself, and the owner will review your request.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                style={inputStyle}
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                style={inputStyle}
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                type="tel"
                style={inputStyle}
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="A little about your coaching background (optional)"
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
              {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: 0 }}>{error}</p>}
              <button
                onClick={submit}
                disabled={submitting}
                style={{
                  background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8,
                  padding: "13px 20px", fontWeight: 700, fontSize: 14, opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Sending..." : "Send request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #E3D9C9", borderRadius: 8, padding: "12px 14px", fontSize: 14, fontFamily: "inherit",
};
