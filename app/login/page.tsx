"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
        <a href="/find-a-pro" style={{ display: "block", marginTop: 16, fontSize: 12.5, color: "var(--faint)" }}>
          Don't have a link from your instructor? Find a Pro near you &gt;
        </a>
      </div>
    </div>
  );
}
