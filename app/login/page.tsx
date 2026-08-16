"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";

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
  const [debugClientId, setDebugClientId] = useState<string | null>(null);
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
      const clientIdInUse = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      setDebugClientId(`"${clientIdInUse || "(EMPTY)"}"`);
      await GoogleSignIn.initialize({ clientId: clientIdInUse! });
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
  async function handleAppleSignIn() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      signIn("apple", { callbackUrl });
      return;
    }

    setAppleError(null);
    setSigningInWithApple(true);
    try {
      const result = await SignInWithApple.authorize({
        clientId: "com.bookmypro.app",
        redirectURI: `${process.env.NEXT_PUBLIC_APP_URL || "https://bookmypro.app"}/api/auth/callback/apple`,
        scopes: "email name",
      });
      const identityToken = result?.response?.identityToken;
      if (!identityToken) throw new Error("Apple didn't return a token");

      // Apple only ever sends the person's name on this very first
      // authorization - never again after that - so it has to be
      // captured and sent along right here or it's lost for good.
      const givenName = result?.response?.givenName;
      const familyName = result?.response?.familyName;
      const name = [givenName, familyName].filter(Boolean).join(" ") || undefined;

      const res = await fetch("/api/auth/apple-native", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identityToken, name }),
      });
      if (!res.ok) throw new Error("Sign-in failed - try again");

      window.location.href = callbackUrl;
    } catch (err: any) {
      console.error("Native Apple sign-in failed:", err);
      const detail = err?.message || err?.code || JSON.stringify(err) || "unknown error";
      setAppleError(`Couldn't sign in with Apple: ${detail}`);
    } finally {
      setSigningInWithApple(false);
    }
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
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#FBF3DE", color: "#1B3A2F", fontSize: 11, padding: "10px 14px", zIndex: 9999, wordBreak: "break-all", fontFamily: "monospace" }}>
        DEBUG client id: "{process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "(EMPTY)"}"
      </div>
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
        {debugClientId && (
          <p style={{ fontSize: 11, color: "#1B3A2F", background: "#FBF3DE", padding: "6px 10px", borderRadius: 6, marginTop: 8, wordBreak: "break-all" }}>
            DEBUG client id: {debugClientId}
          </p>
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
