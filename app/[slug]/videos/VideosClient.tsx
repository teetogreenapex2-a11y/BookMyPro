"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { upload } from "@vercel/blob/client";

type Instructor = { id: string; name: string | null; email: string };
type Comment = { id: string; timestampSeconds: number; text: string };
type Submission = {
  id: string; videoUrl: string; title: string | null; playerNote: string | null;
  status: string; submittedAt: string; reviewedAt: string | null;
  instructorName: string | null; comments: Comment[];
};

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// A plain <a download> doesn't reliably force a download for a
// cross-origin file like these (Vercel Blob lives on a different domain
// than the app) - most browsers just navigate to it instead. Fetching it
// as a blob first, then downloading from that local blob URL, works
// consistently everywhere.
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

export default function VideosClient({ slug, basePath, apiBase }: { slug: string; basePath: string; apiBase: string }) {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const [instructorMembershipId, setInstructorMembershipId] = useState("");
  const [title, setTitle] = useState("");
  const [playerNote, setPlayerNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Inside the wrapped app, this opens the phone's own real camera app to
  // record a fresh swing video directly, rather than only being able to
  // pick an already-recorded file off the device - genuinely faster for
  // the common case of "record my swing right now and send it over."
  // The recorded video comes back as a native file reference (not
  // directly usable for upload), so this fetches it into a real Blob and
  // wraps that as a File - from that point on it's handled by the exact
  // same upload code the regular file picker already uses.
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

  function load() {
    fetch(`${apiBase}/instructors`).then((r) => r.json()).then((list) => {
      setInstructors(list);
      if (list.length === 1) setInstructorMembershipId(list[0].id);
    }).catch(() => {});
    fetch(`${apiBase}/videos`).then((r) => r.json()).then((list) => {
      setSubmissions(Array.isArray(list) ? list : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  // Vercel Blob's client upload finishes in two separate steps: the
  // browser's own upload() call resolves as soon as the file bytes
  // themselves have landed, but the actual database record only gets
  // created moments later by a separate, background callback from Vercel
  // itself - calling load() immediately after upload() can genuinely run
  // before that record exists yet, which is exactly why the new video
  // wasn't showing up without navigating away and back (a later,
  // unrelated page load happened to catch it after the fact). This
  // retries a few times with short, increasing delays instead of trying
  // exactly once too early.
  async function loadVideosWithRetry(previousCount: number, attempt = 0) {
    const res = await fetch(`${apiBase}/videos`);
    const list = await res.json();
    const fresh = Array.isArray(list) ? list : [];
    setSubmissions(fresh);
    if (fresh.length > previousCount || attempt >= 4) return;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    await loadVideosWithRetry(previousCount, attempt + 1);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!file) {
      setError("Choose a video to upload.");
      return;
    }
    if (!instructorMembershipId) {
      setError("Choose which instructor this is for.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `${apiBase}/videos/upload-token`,
        clientPayload: JSON.stringify({
          instructorMembershipId,
          title: title.trim() || undefined,
          playerNote: playerNote.trim() || undefined,
        }),
      });
      setTitle("");
      setPlayerNote("");
      setFile(null);
      loadVideosWithRetry(submissions.length);
    } catch (err: any) {
      setError(err?.message || "Something went wrong uploading that.");
    } finally {
      setUploading(false);
    }
  }

  function jumpTo(submissionId: string, seconds: number) {
    const el = videoRefs.current[submissionId];
    if (el) {
      el.pause();
      el.currentTime = seconds;
    }
  }

  const FRAME_STEP = 1 / 30;
  function stepFrame(submissionId: string, direction: 1 | -1) {
    const el = videoRefs.current[submissionId];
    if (!el) return;
    el.pause();
    const next = el.currentTime + direction * FRAME_STEP;
    el.currentTime = Math.max(0, Math.min(next, el.duration || next));
  }

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  function changeSpeed(submissionId: string, speed: number) {
    setPlaybackSpeed(speed);
    const el = videoRefs.current[submissionId];
    if (el) el.playbackRate = speed;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>Swing videos</span>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Book</a>
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>
                Sign out
              </button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Get feedback on your swing</h1>
          <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>
            Upload a video and your instructor will leave comments pinned to specific moments.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Submit a video</div>

          {instructors.length > 1 && (
            <select
              value={instructorMembershipId}
              onChange={(e) => setInstructorMembershipId(e.target.value)}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8 }}
            >
              <option value="">Which instructor is this for?</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>{i.name || i.email}</option>
              ))}
            </select>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional) - e.g. Driver, face-on"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8 }}
          />
          <textarea
            value={playerNote}
            onChange={(e) => setPlayerNote(e.target.value)}
            placeholder="Anything you want your instructor to know? e.g. 'been slicing my driver lately'"
            rows={2}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8, resize: "vertical" }}
          />
          {isNative && (
            <button
              onClick={recordVideo}
              disabled={recording}
              style={{
                width: "100%", background: "var(--card)", color: "var(--fairway)", border: "1px solid var(--fairway)",
                borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, marginBottom: 8,
                opacity: recording ? 0.7 : 1,
              }}
            >
              {recording ? "Opening camera..." : "🎥 Record a new video"}
            </button>
          )}
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ width: "100%", fontSize: 13, marginBottom: 6 }}
          />
          {file && (
            <p style={{ fontSize: 12, color: "var(--fairway)", fontWeight: 600, margin: "0 0 10px" }}>
              Ready to upload: {file.name}
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}

          <button
            onClick={submit}
            disabled={uploading}
            style={{
              background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
              padding: "10px 18px", fontSize: 13, fontWeight: 700, opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? "Uploading..." : "Submit video"}
          </button>
        </div>

        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
          YOUR SUBMISSIONS
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading...</p>
        ) : submissions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing submitted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {submissions.map((s) => (
              <div key={s.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title || "Untitled video"}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                      with {s.instructorName || "your instructor"} - {new Date(s.submittedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="mono" style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "3px 6px",
                    color: s.status === "reviewed" ? "#1B3A2F" : "#9A7A1E",
                    background: s.status === "reviewed" ? "#E7F0EA" : "#FBF3DE",
                  }}>
                    {s.status === "reviewed" ? "REVIEWED" : "PENDING"}
                  </span>
                </div>

                {openId === s.id && (
                  <div style={{ marginTop: 12 }}>
                    <video
                      ref={(el) => { videoRefs.current[s.id] = el; }}
                      src={s.videoUrl}
                      controls
                      style={{ width: "100%", borderRadius: 8, background: "#000" }}
                    />
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button
                        onClick={() => stepFrame(s.id, -1)}
                        style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--fairway)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer" }}
                      >
                        {"<"} Frame
                      </button>
                      <button
                        onClick={() => stepFrame(s.id, 1)}
                        style={{ flex: 1, fontSize: 15, fontWeight: 700, color: "var(--fairway)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer" }}
                      >
                        Frame {">"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => changeSpeed(s.id, speed)}
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
                    <button
                      onClick={() => downloadVideo(s.videoUrl, `${s.title || "swing-video"}.mp4`)}
                      style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fairway)", background: "none", border: "none", padding: "6px 0 0", cursor: "pointer" }}
                    >
                      v Download
                    </button>
                    {s.playerNote && (
                      <p style={{ fontSize: 12, color: "var(--faint)", margin: "8px 0 0", fontStyle: "italic" }}>
                        Your note: {s.playerNote}
                      </p>
                    )}
                    {s.comments.length > 0 ? (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.comments.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => jumpTo(s.id, c.timestampSeconds)}
                            style={{
                              display: "flex", gap: 8, textAlign: "left", background: "#FFF",
                              border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
                            }}
                          >
                            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", flexShrink: 0 }}>
                              {formatTimestamp(c.timestampSeconds)}
                            </span>
                            <span style={{ fontSize: 13 }}>{c.text}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--faint)", margin: "10px 0 0" }}>
                        No comments yet - check back once your instructor's had a chance to watch.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
