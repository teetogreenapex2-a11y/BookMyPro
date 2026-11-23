"use client";

import { useRouter } from "next/navigation";

export default function BackBar() {
  const router = useRouter();
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "#FFF", borderBottom: "1px solid #E3E6DE", padding: "10px 14px", paddingTop: "calc(10px + env(safe-area-inset-top, 0px))" }}>
      <button
        onClick={() => { if (window.history.length > 1) router.back(); else router.push("/"); }}
        style={{ background: "none", border: "none", fontSize: 16, fontWeight: 600, color: "inherit", cursor: "pointer", padding: 0 }}
      >
        &larr; Back
      </button>
    </div>
  );
}
