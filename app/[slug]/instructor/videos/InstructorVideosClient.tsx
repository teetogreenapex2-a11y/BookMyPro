"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { upload } from "@vercel/blob/client";

type Comment = { id: string; timestampSeconds: number; text: string };
type Submission = {
  id: string; videoUrl: string; title: string | null; playerNote: string | null;
  status: string; submittedAt: string; playerName: string; comments: Comment[];
};

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// See VideosClient.tsx for why this fetches the file rather than using a
// plain download link - same cross-origin reasoning applies here too.
async function downloadVideo(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

type Player = { id: string; name: string | null; email: string };

export default function InstructorVideosClient({ slug, basePath, apiBase, viewerMembershipId }: { slug: string; basePath: string; apiBase: string; viewerMembershipId: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPlayerId, setUploadPlayerId] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  // Checking Capacitor.isNativePlatform() directly during render caused a
  // hydration mismatch (the server always renders as if it's not native,
  // since it has no way to know) - starting this state at false to match
  // the server, and only updating it after mounting on the client, avoids
  // that entirely.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  function loadPlayers() {
    fetch(`${apiBase}/players`).then((r) => r.json()).then((list) => setPlayers(Array.isArray(list) ? list : [])).catch(() => {});
  }

  async function recordVideo() {
    setUploadError(null);
    setRecording(true);
    try {
      const { Camera } = await import("@capacitor/camera");
      const result = await Camera.recordVideo({ saveToGallery: false });
      const res = await fetch(result.webPath!);
      const blob = await res.blob();
      const recordedFile = new File([blob], `swing-${Date.now()}.mp4`, { type: blob.type || "video/mp4" });
      await uploadVideo(recordedFile);
    } catch (err) {
      console.error("Failed to record video:", err);
    } finally {
      setRecording(false);
    }
  }

  async function uploadVideo(file: File) {
    if (!uploadPlayerId) {
      setUploadError("Choose which player this is for first.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `${apiBase}/videos/upload-token`,
        clientPayload: JSON.stringify({
          instructorMembershipId: viewerMembershipId,
          playerId: uploadPlayerId,
          title: uploadTitle.trim() || undefined,
        }),
      });
      setUploadOpen(false);
      setUploadPlayerId("");
      setUploadTitle("");
      loadVideosWithRetry(submissions.length);
    } catch (err: any) {
      setUploadError(err?.message || "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  // Vercel Blob's client upload finishes in two separate steps - the
  // browser's own upload() call resolves once the file bytes have
  // landed, but the actual database record only gets created moments
  // later by a separate background callback from Vercel itself. Calling
  // load() immediately after upload() can genuinely run before that
  // record exists yet - this retries a few times with short, increasing
  // delays instead of checking exactly once too early.
  async function loadVideosWithRetry(previousCount: number, attempt = 0) {
    const res = await fetch(`${apiBase}/videos`);
    const list = await res.json();
    const fresh = Array.isArray(list) ? list : [];
    setSubmissions(fresh);
    setLoading(false);
    if (fresh.length > previousCount || attempt >= 4) return;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    await loadVideosWithRetry(previousCount, attempt + 1);
  }

  function load() {
    fetch(`${apiBase}/videos`).then((r) => r.json()).then((list) => {
      const shaped = Array.isArray(list) ? list : [];
      setSubmissions(shaped);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    load();
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = submissions.find((s) => s.id === selectedId) || null;
  const pending = submissions.filter((s) => s.status === "pending");
  const reviewed = submissions.filter((s) => s.status === "reviewed");

  async function deleteVideo() {
    if (!selected) return;
    if (!window.confirm("Delete this video permanently? This can't be undone.")) return;
    const res = await fetch(`${apiBase}/videos/${selected.id}`, { method: "DELETE" });
    if (res.ok) {
      setSelectedId(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Couldn't delete this video.");
    }
  }

  function jumpTo(seconds: number) {
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.currentTime = seconds;
    }
  }

  // No browser video element has a true "next frame" API - this nudges by
  // roughly one frame's worth of time instead (assuming ~30fps, a
  // reasonable match for most phone-recorded swing footage). Not
  // frame-perfect on every video, but close enough to actually see a
  // swing position clearly, which is what this is really for.
  const FRAME_STEP = 1 / 30;
  function stepFrame(direction: 1 | -1) {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    const next = el.currentTime + direction * FRAME_STEP;
    el.currentTime = Math.max(0, Math.min(next, el.duration || next));
  }

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  function changeSpeed(speed: number) {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }

  async function addComment() {
    if (!selected || !commentDraft.trim() || !videoRef.current) return;
    setPosting(true);
    const res = await fetch(`${apiBase}/videos/${selected.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestampSeconds: videoRef.current.currentTime, text: commentDraft.trim() }),
    });
    setPosting(false);
    if (res.ok) {
      setCommentDraft("");
      load();
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway)" }}>
      <header style={{ padding: "24px 20px", color: "var(--chalk)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>Swing videos</span>
            <a href={`${basePath}/instructor`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
              Back to dashboard
            </a>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Review submissions</h1>
          <a href={`${basePath}/swing-session`} style={{ fontSize: 13, color: "var(--gold)", fontWeight: 700, textDecoration: "none", display: "inline-block", marginTop: 6 }}>
            Record two angles at once (down-the-line + face-on) &rarr;
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px 60px", background: "var(--chalk)", borderRadius: "16px 16px 0 0", minHeight: "60vh" }}>
        <div style={{ paddingTop: 20 }}>
          <button
            onClick={() => { setUploadOpen((o) => !o); setUploadError(null); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "var(--fairway)", color: "var(--chalk)",
              border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, marginBottom: uploadOpen ? 12 : 20,
            }}
          >
            + Upload a video
          </button>

          {uploadOpen && (
            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Footage you recorded yourself - an in-person lesson, say - attributed to a player's history for reference later.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select
                  value={uploadPlayerId}
                  onChange={(e) => setUploadPlayerId(e.target.value)}
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 13, background: "#FFF" }}
                >
                  <option value="">Choose a player...</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.email}</option>
                  ))}
                </select>
                <input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder={'Title (optional) - e.g. "Driver, face-on"'}
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
                />
                {uploadError && <p style={{ fontSize: 12, color: "#B23A3A", margin: 0 }}>{uploadError}</p>}
                {isNative && (
                  <button
                    onClick={recordVideo}
                    disabled={recording || uploading}
                    style={{
                      width: "100%", background: "var(--card)", color: "var(--fairway)", border: "1px solid var(--fairway)",
                      borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700,
                      opacity: recording || uploading ? 0.7 : 1,
                    }}
                  >
                    {recording ? "Opening camera..." : "🎥 Record a new video"}
                  </button>
                )}
                <label style={{ display: "inline-block", textAlign: "center", background: "var(--gold)", color: "var(--fairway)", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1 }}>
                  {uploading ? "Uploading..." : "Choose video file"}
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                    style={{ display: "none" }}
                    disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideo(f); }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 20, paddingTop: 4, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            {loading ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading...</p>
            ) : submissions.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>No videos submitted yet.</p>
            ) : (
              <>
                {pending.length > 0 && (
                  <>
                    <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
                      PENDING ({pending.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                      {pending.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          style={{
                            textAlign: "left", background: selectedId === s.id ? "var(--open)" : "#FFF",
                            border: selectedId === s.id ? "1px solid var(--fairway)" : "1px solid var(--border)",
                            borderRadius: 8, padding: "8px 12px",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title || "Untitled video"}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{s.playerName}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {reviewed.length > 0 && (
                  <>
                    <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
                      REVIEWED ({reviewed.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {reviewed.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          style={{
                            textAlign: "left", background: selectedId === s.id ? "var(--open)" : "#FFF",
                            border: selectedId === s.id ? "1px solid var(--fairway)" : "1px solid var(--border)",
                            borderRadius: 8, padding: "8px 12px", opacity: 0.8,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title || "Untitled video"}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{s.playerName}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div style={{ flex: "2 1 400px", minWidth: 300 }}>
            {!selected ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>Pick a video from the list to review it.</p>
            ) : (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{selected.title || "Untitled video"}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8 }}>
                  {selected.playerName} - {new Date(selected.submittedAt).toLocaleDateString()}
                </div>
                {selected.playerNote && (
                  <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic", marginBottom: 10 }}>
                    "{selected.playerNote}"
                  </p>
                )}
                <video ref={videoRef} src={selected.videoUrl} controls style={{ width: "100%", borderRadius: 8, background: "#000", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <button
                    onClick={() => stepFrame(-1)}
                    style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--fairway)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer" }}
                  >
                    {"<"} Frame
                  </button>
                  <button
                    onClick={() => stepFrame(1)}
                    style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--fairway)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer" }}
                  >
                    Frame {">"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changeSpeed(speed)}
                      style={{
                        flex: 1, fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: "8px 6px", cursor: "pointer",
                        border: playbackSpeed === speed ? "1px solid var(--fairway)" : "1px solid var(--border)",
                        background: playbackSpeed === speed ? "var(--fairway)" : "var(--card)",
                        color: playbackSpeed === speed ? "var(--chalk)" : "var(--fairway)",
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
                  <button
                    onClick={() => downloadVideo(selected.videoUrl, `${selected.title || selected.playerName || "swing-video"}.mp4`)}
                    style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fairway)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    v Download
                  </button>
                  <button
                    onClick={deleteVideo}
                    style={{ fontSize: 11.5, fontWeight: 700, color: "#B23A3A", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Comment at the current point in the video..."
                    style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
                  />
                  <button
                    onClick={addComment}
                    disabled={posting || !commentDraft.trim()}
                    style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, opacity: posting ? 0.7 : 1 }}
                  >
                    Add at {videoRef.current ? formatTimestamp(videoRef.current.currentTime) : "0:00"}
                  </button>
                </div>

                {selected.comments.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selected.comments.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => jumpTo(c.timestampSeconds)}
                        style={{ display: "flex", gap: 8, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}
                      >
                        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", flexShrink: 0 }}>
                          {formatTimestamp(c.timestampSeconds)}
                        </span>
                        <span style={{ fontSize: 13 }}>{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
