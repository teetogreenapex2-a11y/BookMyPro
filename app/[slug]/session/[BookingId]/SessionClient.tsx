"use client";

import { useEffect, useRef, useState } from "react";
import SwingCanvas, { SwingCanvasHandle } from "@/components/SwingCanvas";

declare global {
  interface Window {
    DailyIframe?: any;
  }
}

export default function SessionClient({
  videoCallUrl,
  playerId,
  playerName,
  isInstructor,
  basePath,
  apiBase,
}: {
  videoCallUrl: string;
  playerId: string;
  playerName: string;
  isInstructor: boolean;
  basePath: string;
  apiBase: string;
}) {
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const callFrameRef = useRef<any>(null);
  const canvasHandleRef = useRef<SwingCanvasHandle | null>(null);
  const [sketchStarted, setSketchStarted] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load Daily via a plain script tag rather than an npm dependency - the
  // exact approach Daily's own docs recommend for embedding, and it
  // sidesteps needing to add and version a new package for this alone.
  useEffect(() => {
    if (window.DailyIframe) {
      joinCall();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@daily-co/daily-js";
    script.async = true;
    script.onload = joinCall;
    document.body.appendChild(script);
    return () => {
      callFrameRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function joinCall() {
    if (!videoContainerRef.current || !window.DailyIframe || callFrameRef.current) return;
    const callFrame = window.DailyIframe.createFrame(videoContainerRef.current, {
      iframeStyle: { width: "100%", height: "100%", border: "0" },
      showLeaveButton: true,
    });
    callFrame.join({ url: videoCallUrl });
    callFrameRef.current = callFrame;
  }

  async function uploadSourcePhoto(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("source", file);
    // Reuses the same upload handling as the standalone Swing Sketch
    // creation flow - just gets us a hosted image URL back to draw on.
    const res = await fetch(`${apiBase}/swing-sketches/upload-source`, { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (res.ok && data.url) {
      setSourceUrl(data.url);
      setSketchStarted(true);
    }
  }

  async function saveSketch() {
    if (!canvasHandleRef.current) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const pngBlob = await canvasHandleRef.current.exportPng();
      const shapesData = canvasHandleRef.current.getShapesJson();
      const form = new FormData();
      form.append("image", pngBlob, "sketch.png");
      form.append("shapesJson", shapesData);
      form.append("playerId", playerId);
      form.append("label", `From live session - ${new Date().toLocaleDateString()}`);
      const res = await fetch(`${apiBase}/swing-sketches`, { method: "POST", body: form });
      if (res.ok) {
        setSaveMessage("Saved - this player can view it anytime from their Swing Sketches.");
      } else {
        setSaveMessage("Couldn't save that sketch - try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1B3A2F", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#B8862B" }}>REMOTE SESSION</div>
          <div style={{ color: "#F6F4EE", fontWeight: 700, fontSize: 15 }}>with {playerName}</div>
        </div>
        <a href={`${basePath}/instructor`} style={{ color: "#D7DED9", fontSize: 13, textDecoration: "none" }}>Back to dashboard</a>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "0 12px 12px" }}>
        <div ref={videoContainerRef} style={{ width: "100%", height: "45vh", background: "#000", borderRadius: 12, overflow: "hidden" }} />

        <div style={{ flex: 1, background: "#FFF", borderRadius: 12, padding: 14, minHeight: 320 }}>
          {!isInstructor ? (
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginTop: 40 }}>
              Your instructor may share a Swing Sketch here during your session.
            </p>
          ) : !sketchStarted ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                Snap or upload a photo of {playerName}'s swing to start sketching on it together.
              </p>
              <label style={{ display: "inline-block", background: "var(--fairway)", color: "var(--chalk)", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {uploading ? "Uploading..." : "Add a photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSourcePhoto(f); }}
                />
              </label>
            </div>
          ) : (
            <>
              <SwingCanvas initialSourceUrl={sourceUrl} onReady={(handle) => { canvasHandleRef.current = handle; }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                {saveMessage && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>{saveMessage}</span>}
                <button
                  onClick={saveSketch}
                  disabled={saving}
                  style={{ background: "var(--gold)", color: "var(--fairway)", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}
                >
                  {saving ? "Saving..." : "Save sketch for player"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
