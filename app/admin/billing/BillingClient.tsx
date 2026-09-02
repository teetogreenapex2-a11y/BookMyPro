"use client";

import { useEffect, useState } from "react";

type Business = {
  id: string;
  slug: string;
  name: string;
  email: string;
  subscriptionStatus: string;
  ownerName: string | null;
  ownerEmail: string | null;
  instructorCount: number;
};

const STATUS_COLORS: Record<string, string> = {
  trial: "#B8862B",
  active: "#3E7A56",
  past_due: "#B23A3A",
  cancelled: "#8A8571",
};

export default function BillingClient() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingUpFor, setSettingUpFor] = useState<string | null>(null);
  const [tier, setTier] = useState<"monthly" | "academy">("monthly");
  const [instructorCount, setInstructorCount] = useState("1");
  const [generating, setGenerating] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy link");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/billing");
    if (res.ok) setBusinesses(await res.json());
    setLoading(false);
  }

  function openSetup(b: Business) {
    setSettingUpFor(b.id);
    setTier("monthly");
    setInstructorCount(String(b.instructorCount || 1));
    setCheckoutUrl(null);
    setCopyLabel("Copy link");
  }

  async function generateLink() {
    if (!settingUpFor) return;
    setGenerating(true);
    setCheckoutUrl(null);
    const res = await fetch("/api/admin/billing/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: settingUpFor,
        tier,
        instructorCount: tier === "academy" ? instructorCount : undefined,
      }),
    });
    setGenerating(false);
    if (res.ok) {
      const data = await res.json();
      setCheckoutUrl(data.url);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't generate a checkout link.");
    }
  }

  function copyLink() {
    if (!checkoutUrl) return;
    navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy link"), 2000);
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F4EE", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 8 }}>BOOKMYPRO ADMIN</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: "#1B3A2F", margin: "0 0 20px" }}>Billing</h1>

        {loading ? (
          <p style={{ color: "#5C6459" }}>Loading...</p>
        ) : businesses.length === 0 ? (
          <p style={{ color: "#5C6459" }}>No approved businesses yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {businesses.map((b) => (
              <div key={b.id} style={{ background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F" }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: "#8A8571" }}>{b.slug} · {b.instructorCount} instructor{b.instructorCount === 1 ? "" : "s"}</div>
                    <div style={{ fontSize: 12, color: "#5C6459", marginTop: 2 }}>
                      {b.ownerName || "(no name)"} &lt;{b.ownerEmail}&gt;
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: STATUS_COLORS[b.subscriptionStatus] || "#5C6459", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {b.subscriptionStatus.replace("_", " ")}
                    </div>
                  </div>
                  <button
                    onClick={() => openSetup(b)}
                    style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 700, fontSize: 12, flexShrink: 0 }}
                  >
                    Set up billing
                  </button>
                </div>

                {settingUpFor === b.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #E3D9C9" }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <button
                        onClick={() => { setTier("monthly"); setCheckoutUrl(null); }}
                        style={{
                          flex: 1, border: `1px solid ${tier === "monthly" ? "#1B3A2F" : "#E3D9C9"}`, borderRadius: 8, padding: "8px 10px",
                          background: tier === "monthly" ? "#1B3A2F" : "#FFF", color: tier === "monthly" ? "#F6F4EE" : "#1B3A2F", fontSize: 12.5, fontWeight: 700,
                        }}
                      >
                        Monthly - $39.99/mo
                      </button>
                      <button
                        onClick={() => { setTier("academy"); setCheckoutUrl(null); }}
                        style={{
                          flex: 1, border: `1px solid ${tier === "academy" ? "#1B3A2F" : "#E3D9C9"}`, borderRadius: 8, padding: "8px 10px",
                          background: tier === "academy" ? "#1B3A2F" : "#FFF", color: tier === "academy" ? "#F6F4EE" : "#1B3A2F", fontSize: 12.5, fontWeight: 700,
                        }}
                      >
                        Academy - $49.99/mo + $24.99/instructor
                      </button>
                    </div>

                    {tier === "academy" && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, color: "#5C6459", display: "block", marginBottom: 4 }}>Number of instructors (not counting the owner)</label>
                        <input
                          value={instructorCount}
                          onChange={(e) => { setInstructorCount(e.target.value); setCheckoutUrl(null); }}
                          inputMode="numeric"
                          style={{ width: 100, border: "1px solid #E3D9C9", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
                        />
                      </div>
                    )}

                    {checkoutUrl ? (
                      <div>
                        <div style={{ fontSize: 12, color: "#5C6459", marginBottom: 6 }}>Send this link directly to {b.ownerEmail || "the customer"}:</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input readOnly value={checkoutUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, border: "1px solid #E3D9C9", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 12, background: "#F6F4EE" }} />
                          <button onClick={copyLink} style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                            {copyLabel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={generateLink}
                        disabled={generating}
                        style={{ background: "#B8862B", color: "#1B3A2F", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, opacity: generating ? 0.6 : 1 }}
                      >
                        {generating ? "Generating…" : "Generate checkout link"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
