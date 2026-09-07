"use client";

import { useEffect, useState } from "react";

// A dismissible, proactive prompt for the exact same push-permission
// flow the existing small button already offers - built because a
// passive button sitting somewhere on the page is genuinely easy to
// scroll past entirely, which is exactly the problem this exists to
// fix. Shows automatically whenever notifications are detected as off,
// unless this same person already explicitly said no before for this
// specific business - that "no" is remembered forever (via local
// storage on this device), while notifications simply still being off
// after a "yes" keeps this showing again on a future visit, since the
// actual OS-level permission could still fail or get turned off again
// later without them ever changing their mind about wanting it.
export default function PushNotificationPrompt({
  pushStatus, pushError, onEnable, slug, audience,
}: {
  pushStatus: "unknown" | "unsupported" | "off" | "on" | "enabling";
  pushError?: string | null;
  onEnable: () => void;
  slug: string;
  audience: "instructor" | "player";
}) {
  const storageKey = `push-prompt-declined:${slug}:${audience}`;
  const [dismissed, setDismissed] = useState(true); // starts hidden until the local-storage check below actually runs, avoiding a flash of the prompt on every load before that check completes
  // Separate from the permanent decline above - this only lasts for the
  // current page load (plain component state, never written to local
  // storage), and exists specifically for the case where someone DID say
  // yes but the actual attempt genuinely failed (private browsing
  // blocking it, a browser that doesn't support it, etc.). That's not
  // the same thing as an explicit "no" - it might work fine for them in
  // a normal browser later, so it shouldn't be remembered forever, just
  // kept from immediately popping back up again with no explanation.
  const [sessionDismissed, setSessionDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey) === "true");
    } catch {
      // Local storage can genuinely fail (private browsing, storage
      // disabled) - defaulting to not-dismissed just means the prompt
      // shows again next time, the same safe fallback as never having
      // asked before at all.
      setDismissed(false);
    }
  }, [storageKey]);

  if (pushStatus !== "off" || dismissed || sessionDismissed) return null;

  function declineForever() {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Nothing further to do if this fails - worst case, the prompt
      // shows again next time, which is a mild annoyance, not a bug.
    }
    setDismissed(true);
  }

  if (pushError) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}>
        <div style={{ background: "#FFF", borderRadius: 14, padding: "22px 20px", maxWidth: 340, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A2F", marginBottom: 6 }}>Couldn't turn on notifications</div>
          <p style={{ fontSize: 13, color: "#5C6459", margin: "0 0 4px" }}>
            This browser or device blocked the request. Private/incognito windows often don't allow this - try again in a regular browser window, or check your device's own notification settings.
          </p>
          <p style={{ fontSize: 11.5, color: "#B23A3A", margin: "8px 0 18px", fontFamily: "monospace" }}>{pushError}</p>
          <button
            onClick={() => setSessionDismissed(true)}
            style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "11px 16px", fontWeight: 700, fontSize: 14, width: "100%" }}
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,28,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}>
      <div style={{ background: "#FFF", borderRadius: 14, padding: "22px 20px", maxWidth: 340, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1B3A2F", marginBottom: 6 }}>Turn on notifications?</div>
        <p style={{ fontSize: 13.5, color: "#5C6459", margin: "0 0 18px" }}>
          {audience === "instructor"
            ? "Get notified the moment a new booking comes in, so you never miss one."
            : "Get notified about your bookings and any updates from your instructor."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onEnable}
            style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "11px 16px", fontWeight: 700, fontSize: 14 }}
          >
            Yes, turn on
          </button>
          <button
            onClick={declineForever}
            style={{ background: "none", color: "#8A8571", border: "none", padding: "6px 16px", fontWeight: 600, fontSize: 13 }}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
