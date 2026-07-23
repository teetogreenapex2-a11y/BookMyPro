"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function sendMagicLink() {
    if (!email.trim()) return;
    setSendingLink(true);
    await signIn("email", { email, callbackUrl, redirect: false });
    setSendingLink(false);
    setLinkSent(true);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--fairway)",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--chalk)",
          borderRadius: 16,
          padding: "40px 32px",
          textAlign: "center",
          maxWidth: 360,
          width: "100%",
        }}
      >
        <img src="/logo.jpg" alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover", margin: "0 auto 14px" }} />
        <div className="mono" style={{ fontSize: 12, letterSpacing: "0.12em", color: "var(--gold)", marginBottom: 8 }}>
          BOOKMYPRO
        </div>
        <h1 className="display" style={{ fontSize: 26, marginBottom: 24 }}>
          Sign in to book
        </h1>
        <button
          onClick={() => signIn("google", { callbackUrl })}
          style={{
            width: "100%",
            background: "var(--fairway)",
            color: "var(--chalk)",
            border: "none",
            borderRadius: 8,
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--faint)" }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        {linkSent ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Check your email - we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              type="email"
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "11px 14px",
                fontSize: 14,
                fontFamily: "inherit",
                marginBottom: 10,
                boxSizing: "border-box",
              }}
            />
            <button
              onClick={sendMagicLink}
              disabled={sendingLink || !email.trim()}
              style={{
                width: "100%",
                background: "none",
                color: "var(--fairway)",
                border: "1px solid var(--fairway)",
                borderRadius: 8,
                padding: "12px 20px",
                fontWeight: 700,
                fontSize: 14,
                opacity: sendingLink || !email.trim() ? 0.6 : 1,
              }}
            >
              {sendingLink ? "Sending..." : "Email me a sign-in link"}
            </button>
            <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 8 }}>
              No password needed - we'll send a link to sign in with.
            </p>
          </>
        )}

        <a href="/find-a-pro" style={{ display: "block", marginTop: 16, fontSize: 12.5, color: "var(--faint)" }}>
          Don't have a link from your instructor? Find a Pro near you &gt;
        </a>
      </div>
    </div>
  );
}
