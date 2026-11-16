"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

const MAX_SECONDS = 180;

function pickMime(): string {
  const options = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  for (const o of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(o)) return o;
  }
  return "";
}

// The instructor talks over a swing; the student hears it with their review.
export default function VoiceOverRecorder({ apiBase, submissionId, existingUrl, onChange }: { apiBase: string; submissionId: string; existingUrl: string | null; onChange: (url: string | null) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "recorded" | "saving">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Switching to another video resets the recorder.
  useEffect(() => { setState("idle"); setPreviewUrl(null); setError(null); blobRef.current = null; }, [submissionId]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setState("recorded");
      };
      rec.start();
      recRef.current = rec;
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Couldn't use the microphone. Allow microphone access for this site or app, then try again.");
    }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  async function save() {
    const blob = blobRef.current;
    if (!blob) return;
    setState("saving");
    setError(null);
    try {
      const base = (blob.type || "audio/webm").split(";")[0];
      const ext = base.includes("mp4") ? "m4a" : "webm";
      const result = await upload(`voice-over-${submissionId}.${ext}`, blob, {
        access: "public",
        handleUploadUrl: `${apiBase}/videos/${submissionId}/voice-token`,
        contentType: base,
        clientPayload: JSON.stringify({ submissionId }),
      });
      const res = await fetch(`${apiBase}/videos/${submissionId}/voice`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: result.url }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save");
      onChange(result.url);
      setPreviewUrl(null);
      blobRef.current = null;
      setState("idle");
    } catch (e: any) {
      setError(e?.message || "Couldn't save the voice-over. Try again.");
      setState("recorded");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this voice-over?")) return;
    await fetch(`${apiBase}/videos/${submissionId}/voice`, { method: "DELETE" });
    onChange(null);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const b: React.CSSProperties = { borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Voice-over</div>
      {existingUrl && state === "idle" && (
        <div style={{ marginBottom: 8 }}>
          <audio controls src={existingUrl} style={{ width: "100%" }} />
          <button onClick={remove} style={{ ...b, background: "#FFF", color: "#8A2B2B", border: "1px solid #D9B7B7", marginTop: 6 }}>Delete voice-over</button>
        </div>
      )}
      {state === "idle" && (
        <button onClick={start} style={{ ...b, background: "var(--fairway)", color: "#FFF", border: "none" }}>
          {existingUrl ? "Record a new one" : "Record voice-over"}
        </button>
      )}
      {state === "recording" && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "#B3261E", fontWeight: 700, fontSize: 13 }}>● Recording {mmss}</span>
          <button onClick={stop} style={{ ...b, background: "#B3261E", color: "#FFF", border: "none" }}>Stop</button>
        </div>
      )}
      {(state === "recorded" || state === "saving") && previewUrl && (
        <div>
          <audio controls src={previewUrl} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button disabled={state === "saving"} onClick={save} style={{ ...b, background: "var(--fairway)", color: "#FFF", border: "none" }}>{state === "saving" ? "Saving..." : "Save to student"}</button>
            <button disabled={state === "saving"} onClick={() => { setPreviewUrl(null); blobRef.current = null; setState("idle"); }} style={{ ...b, background: "#FFF", color: "var(--fairway)", border: "1px solid var(--border)" }}>Re-record</button>
          </div>
        </div>
      )}
      {error && <div style={{ color: "#B3261E", fontSize: 12, marginTop: 6 }}>{error}</div>}
      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>Up to 3 minutes. Your student hears it with this video.</div>
    </div>
  );
}
