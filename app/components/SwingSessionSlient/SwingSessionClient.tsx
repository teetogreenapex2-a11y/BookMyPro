"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { upload } from "@vercel/blob/client";

type Instructor = { id: string; name: string | null; email: string };
type Customer = { id: string; name: string | null; email: string };
type SessionVideo = { id: string; angle: string | null; videoUrl: string };
type SwingSession = { id: string; joinCode: string; instructorMembershipId: string; playerId: string; videos: SessionVideo[] };

export default function SwingSessionClient({
  slug, basePath, apiBase,
}: { slug: string; basePath: string; apiBase: string }) {
  const [mode, setMode] = useState<"choose" | "start" | "join" | "record" | "waiting" | "done">("choose");
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [instructorMembershipId, setInstructorMembershipId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [swingSession, setSwingSession] = useState<SwingSession | null>(null);
  const [angle, setAngle] = useState<"down_the_line" | "face_on" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/instructors`).then((r) => r.json()).then((list) => {
      setInstructors(Array.isArray(list) ? list : []);
      if (list.length === 1) setInstructorMembershipId(list[0].id);
    }).catch(() => {});
    // A person with access to a real customer list is staff (owner or
    // instructor) - the same distinction the regular video upload flow
    // already makes, reused here rather than re-deriving it separately.
    fetch(`${apiBase}/players`).then((r) => (r.ok ? r.json() : null)).then((list) => {
      if (Array.isArray(list)) {
        setIsStaff(true);
        setCustomers(list);
      }
    }).catch(() => {});
  }, [apiBase]);

  async function startSession() {
    if (!instructorMembershipId) { setError("Choose which instructor this is for."); return; }
    if (isStaff && !playerId) { setError("Choose which player this is for."); return; }
    setBusy(true);
    setError(null);
    const res = await fetch(`${apiBase}/swing-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructorMembershipId, playerId: isStaff ? playerId : undefined }),
    });
    setBusy(false);
    if (res.ok) {
      const created = await res.json();
      setSwingSession({ ...created, videos: [] });
      setMode("record");
    } else {
      const data = await res.json();
      setError(data.error || "Couldn't start a session.");
    }
  }

  async function joinSession() {
    if (!joinCodeInput.trim()) { setError("Enter the code shown on the other phone."); return; }
    setBusy(true);
    setError(null);
    const res = await fetch(`${apiBase}/swing-sessions/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCode: joinCodeInput.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      const joined = await res.json();
      setSwingSession(joined);
      setMode("record");
    } else {
      const data = await res.json();
      setError(data.error || "Couldn't join that session.");
    }
  }

  async function recordVideo() {
    setError(null);
    setRecording(true);
    try {
      const { Camera } = await import("@capacitor/camera");
      const result = await Camera.recordVideo({ saveToGallery: true });
      const res = await fetch(result.webPath!);
      const blob = await res.blob();
      const recordedFile = new File([blob], `swing-${Date.now()}.mp4`, { type: blob.type || "video/mp4" });
      setFile(recordedFile);
    } catch (err) {
      console.error("Failed to record video:", err);
    } finally {
      setRecording(false);
    }
  }

  async function uploadThisAngle() {
    if (!file || !angle || !swingSession) return;
    setBusy(true);
    setError(null);
    try {
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `${apiBase}/videos/upload-token`,
        clientPayload: JSON.stringify({
          instructorMembershipId: swingSession.instructorMembershipId,
          playerId: isStaff ? swingSession.playerId : undefined,
          swingSessionId: swingSession.id,
          angle,
          title: angle === "down_the_line" ? "Down the line" : "Face on",
        }),
      });
      setMode("waiting");
    } catch (err: any) {
      setError(err?.message || "Something went wrong uploading that.");
    } finally {
      setBusy(false);
    }
  }

  // Once this device's own angle is up, poll for whether the other
  // device's video has landed yet too - same reasoning as the regular
  // video list's own retry-on-load logic, just framed as "waiting for a
  // second person" instead of "waiting for one background callback."
  useEffect(() => {
    if (mode !== "waiting" || !swingSession) return;
    const interval = setInterval(async () => {
      const res = await fetch(`${apiBase}/swing-sessions/${swingSession.id}`);
      if (res.ok) {
        const updated = await res.json();
        setSwingSession(updated);
        if (updated.videos.length >= 2) {
          setMode("done");
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [mode, swingSession, apiBase]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "20px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <a href={basePath} style={{ color: "#D7DED9", textDecoration: "none", fontSize: 13 }}>&larr; Back</a>
          <h1 className="display" style={{ fontSize: 22, margin: "6px 0 0" }}>Two-camera swing session</h1>
        </div>
      </header>

      <main style={{ maxWidth: 520, margin: "0 auto", padding: "24px 20px 60px" }}>
        {error && (
          <p style={{ fontSize: 13, color: "#B23A3A", background: "#FBE9E9", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>{error}</p>
        )}

        {mode === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              Record down-the-line and face-on angles of the same swing from two phones, and review them together.
            </p>
            <button onClick={() => setMode("start")} style={primaryBtn}>Start a new session (first phone)</button>
            <button onClick={() => setMode("join")} style={ghostBtn}>Join with a code (second phone)</button>
          </div>
        )}

        {mode === "start" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {instructors.length > 1 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>INSTRUCTOR</div>
                <select value={instructorMembershipId} onChange={(e) => setInstructorMembershipId(e.target.value)} style={selectStyle}>
                  <option value="">Choose an instructor</option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>{i.name || i.email}</option>
                  ))}
                </select>
              </div>
            )}
            {isStaff && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>PLAYER</div>
                <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} style={selectStyle}>
                  <option value="">Choose a player</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={startSession} disabled={busy} style={primaryBtn}>{busy ? "Starting…" : "Start session"}</button>
          </div>
        )}

        {mode === "join" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>CODE FROM THE OTHER PHONE</div>
              <input
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="6-digit code"
                style={{ ...selectStyle, fontSize: 20, textAlign: "center", letterSpacing: "0.1em" }}
              />
            </div>
            <button onClick={joinSession} disabled={busy} style={primaryBtn}>{busy ? "Joining…" : "Join session"}</button>
          </div>
        )}

        {mode === "record" && swingSession && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 4 }}>SESSION CODE</div>
              <div className="mono" style={{ fontSize: 32, fontWeight: 700, color: "var(--fairway)", letterSpacing: "0.15em" }}>
                {swingSession.joinCode}
              </div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>Enter this on the other phone to link the two videos.</div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>WHICH ANGLE IS THIS PHONE?</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setAngle("down_the_line")} style={angle === "down_the_line" ? primaryBtn : ghostBtn}>Down the line</button>
                <button onClick={() => setAngle("face_on")} style={angle === "face_on" ? primaryBtn : ghostBtn}>Face on</button>
              </div>
            </div>

            {angle && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Capacitor.isNativePlatform() ? (
                  <button onClick={recordVideo} disabled={recording} style={ghostBtn}>
                    {recording ? "Recording…" : file ? "Re-record" : "Record video"}
                  </button>
                ) : (
                  <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                )}
                {file && <p style={{ fontSize: 12, color: "var(--muted)" }}>Ready: {file.name}</p>}
                <button onClick={uploadThisAngle} disabled={!file || busy} style={primaryBtn}>
                  {busy ? "Uploading…" : "Upload this angle"}
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "waiting" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 15, color: "var(--muted)" }}>Your angle is uploaded.</p>
            <p style={{ fontSize: 15, color: "var(--muted)" }}>Waiting for the other phone to finish…</p>
          </div>
        )}

        {mode === "done" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--fairway)", marginBottom: 10 }}>Both angles are in.</p>
            <a href={`${basePath}/videos`} style={{ ...primaryBtn, display: "inline-block", textDecoration: "none" }}>
              View in your videos
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
  padding: "12px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  background: "#FFF", color: "var(--fairway)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "12px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
};
const selectStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14,
};
