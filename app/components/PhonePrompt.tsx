"use client";

import { useEffect, useState } from "react";

// A one-time "please add your phone number" pop-up, shown to owners and
// instructors who set up their account before a phone number was required.
// Saving writes it to their profile (the same field as Settings -> Profile);
// "Later" only hides it for this visit, so it comes back next time until a
// number is actually on file.
export default function PhonePrompt({ audience = "instructor" }: { audience?: "instructor" | "customer" }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorage can throw in private windows or with blocked site
    // data - if so, just show the prompt.
    try {
      if (sessionStorage.getItem("phonePromptDismissed") === "1") return;
    } catch {}
    setOpen(true);
  }, []);

  function later() {
    try {
      sessionStorage.setItem("phonePromptDismissed", "1");
    } catch {}
    setOpen(false);
  }

  async function save() {
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Enter a phone number we can reach you at.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) {
        setError("Couldn't save that - try again.");
        setSaving(false);
        return;
      }
      setOpen(false);
    } catch {
      setError("Couldn't save that - try again.");
    }
    setSaving(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-prompt-title"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,35,28,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "28px 26px", maxWidth: 400, width: "100%", fontFamily: "'Inter', sans-serif" }}>
        <h2 id="phone-prompt-title" style={{ fontSize: 20, margin: "0 0 8px", color: "#1B3A2F" }}>Add your phone number</h2>
        <p style={{ fontSize: 14, color: "#5C6459", lineHeight: 1.5, margin: "0 0 18px" }}>
          {audience === "customer"
            ? "Please add a phone number to your profile so your instructor can reach you about your lessons and bookings."
            : "Please add a phone number to your profile so your students and the BookMyPro team can reach you."}
        </p>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="(555) 555-5555"
          autoComplete="tel"
          autoFocus
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E3D9C9", borderRadius: 8, padding: "12px 14px", fontSize: 16, fontFamily: "inherit", marginBottom: 10 }}
        />
        {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={later}
            style={{ flex: 1, background: "transparent", color: "#5C6459", border: "1px solid #DDD8C8", borderRadius: 8, padding: "12px 16px", fontWeight: 600, fontSize: 14 }}
          >
            Later
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{ flex: 1, background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 16px", fontWeight: 700, fontSize: 14, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
