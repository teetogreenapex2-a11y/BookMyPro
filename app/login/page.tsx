"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";

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
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [signingInWithGoogle, setSigningInWithGoogle] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [signingInWithApple, setSigningInWithApple] = useState(false);

  async function sendMagicLink() {
    if (!email.trim()) return;
    setSendingLink(true);
    await signIn("email", { email, callbackUrl, redirect: false });
    setSendingLink(false);
    setLinkSent(true);
  }

  // Google itself blocks its normal web sign-in flow from working inside
  // an embedded native app view, for security reasons - it requires a
  // real, full browser. Inside the native app, this uses Capacitor's own
  // native Google Sign-In plugin instead, which hands back a real ID
  // token directly rather than doing a browser redirect - that token
  // then gets verified server-side at /api/auth/google-native, which
  // signs the person in exactly as the normal web flow would.
  async function handleGoogleSignIn() {
    if (!Capacitor.isNativePlatform()) {
      signIn("google", { callbackUrl });
      return;
    }

    setGoogleError(null);
    setSigningInWithGoogle(true);
    try {
      await GoogleSignIn.initialize({ clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID! });
      const result = await GoogleSignIn.signIn();
      if (!result.idToken) throw new Error("Google didn't return a token");

      const res = await fetch("/api/auth/google-native", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: result.idToken }),
      });
      if (!res.ok) throw new Error("Sign-in failed - try again");

      window.location.href = callbackUrl;
    } catch (err: any) {
      console.error("Native Google sign-in failed:", err);
      // Temporarily showing the real, specific error instead of a
      // generic message - there's no easy way to inspect the JavaScript
      // console on an iPad without a Mac, so this is the most direct
      // way to actually see what's failing. Safe to revert to the
      // generic message once this is sorted out.
      const detail = err?.message || err?.code || JSON.stringify(err) || "unknown error";
      setGoogleError(`Couldn't sign in with Google: ${detail}`);
    } finally {
      setSigningInWithGoogle(false);
    }
  }

  // Apple's native Sign in with Apple SDK is iOS-only - unlike Google,
  // Apple doesn't block its own web sign-in flow inside an embedded app
  // view, so Android and the website both just use the normal redirect.
  // Only the iOS app needs this separate, native path.
  // Unlike Google, Apple's own web sign-in flow isn't blocked inside an
  // embedded native app view - so unlike Google (which genuinely needs
  // its own separate native path on iOS), Apple can safely use this
  // same, reliable web redirect on every platform: the website,
  // Android, and iOS alike.
  function handleAppleSignIn() {
    signIn("apple", { callbackUrl });
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
          onClick={handleGoogleSignIn}
          disabled={signingInWithGoogle}
          style={{
            width: "100%",
            background: "var(--fairway)",
            color: "var(--chalk)",
            border: "none",
            borderRadius: 8,
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: 14,
            opacity: signingInWithGoogle ? 0.6 : 1,
          }}
        >
          {signingInWithGoogle ? "Signing in..." : "Continue with Google"}
        </button>
        {googleError && (
          <p style={{ fontSize: 12, color: "#B23A3A", marginTop: 8 }}>{googleError}</p>
        )}

        <button
          onClick={handleAppleSignIn}
          disabled={signingInWithApple}
          style={{
            width: "100%",
            background: "#000",
            color: "#FFF",
            border: "none",
            borderRadius: 8,
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: 14,
            marginTop: 10,
            opacity: signingInWithApple ? 0.6 : 1,
          }}
        >
          {signingInWithApple ? "Signing in..." : "Continue with Apple"}
        </button>
        {appleError && (
          <p style={{ fontSize: 12, color: "#B23A3A", marginTop: 8 }}>{appleError}</p>
        )}

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
