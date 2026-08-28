"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { Browser } from "@capacitor/browser";

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
      await SocialLogin.initialize({
        google: {
          webClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
          // Same real iOS OAuth client whose reversed form is already
          // registered as a URL scheme in Info.plist by codemagic.yaml's
          // "Add Google Sign-In URL scheme" step - hardcoded to match
          // that file directly (this is a public client id, not a
          // secret) rather than a new env var, both need to point at the
          // exact same client for sign-in to actually complete on iOS.
          iOSClientId: "748505012241-0ri4odsjmdmbcv9usac2ka67pgbqf9ao.apps.googleusercontent.com",
        },
      });
      // filterByAuthorizedAccounts defaults to true, which only shows
      // accounts that have already signed into this exact app before -
      // genuinely useless for every brand-new tester, who by definition
      // has never done that yet. Setting it false shows every Google
      // account on the device instead, same as the account picker
      // people actually expect to see.
      const { result } = await SocialLogin.login({
        provider: "google",
        options: { filterByAuthorizedAccounts: false },
      });
      const idToken = "idToken" in result ? result.idToken : null;
      if (!idToken) throw new Error("Google didn't return a token");

      const res = await fetch("/api/auth/google-native", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
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
      const detail = JSON.stringify(err, Object.getOwnPropertyNames(err || {})) || String(err) || "unknown error";
      setGoogleError(`Couldn't sign in with Google: ${detail}`);
    } finally {
      setSigningInWithGoogle(false);
    }
  }

  // Apple's own sign-in screen isn't blocked inside an embedded web view
  // the way Google's is - so the plain redirect below works fine on the
  // website and on Android. iOS is the real exception: its WKWebView
  // doesn't reliably carry cookies through the multi-hop redirect this
  // flow requires, which shows up as the sign-in silently failing, or
  // "succeeding" by unexpectedly escaping into Safari with no way back
  // into the app. Routing this one platform through the system browser
  // deliberately - then catching the person coming back via a Universal
  // Link - fixes both: a real browser has none of the embedded view's
  // cookie issues, and the handoff (see NativeAuthHandoff in
  // schema.prisma) is what actually gets that session back into the
  // app's own, separate cookie storage afterward.
  async function handleAppleSignIn() {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
      setSigningInWithApple(true);
      const nativeCompleteUrl = `https://bookmypro.app/native-auth-complete?finalUrl=${encodeURIComponent(callbackUrl)}`;
      const signInUrl = `https://bookmypro.app/api/auth/signin/apple?callbackUrl=${encodeURIComponent(nativeCompleteUrl)}`;
      await Browser.open({ url: signInUrl });
      return;
    }
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
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "#B23A3A", margin: 0 }}>{googleError}</p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(googleError)}
              style={{
                marginTop: 4, background: "none", border: "1px solid #B23A3A", color: "#B23A3A",
                fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
              }}
            >
              Copy error
            </button>
          </div>
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
