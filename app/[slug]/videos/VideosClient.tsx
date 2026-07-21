"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

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
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

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
    const form = new FormData();
    form.append("video", file);
    form.append("instructorMembershipId", instructorMembershipId);
    if (title.trim()) form.append("title", title.trim());
    if (playerNote.trim()) form.append("playerNote", playerNote.trim());

    const res = await fetch(`${apiBase}/videos`, { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      setTitle("");
      setPlayerNote("");
      setFile(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong uploading that.");
    }
  }

  function jumpTo(submissionId: string, seconds: number) {
    const el = videoRefs.current[submissionId];
    if (el) {
      el.currentTime = seconds;
      el.play();
    }
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
            placeholder="Title (optional) — e.g. Driver, face-on"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8 }}
          />
          <textarea
            value={playerNote}
            onChange={(e) => setPlayerNote(e.target.value)}
            placeholder="Anything you want your instructor to know? e.g. 'been slicing my driver lately'"
            rows={2}
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8, resize: "vertical" }}
          />
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ width: "100%", fontSize: 13, marginBottom: 10 }}
          />

          {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}

          <button
            onClick={submit}
            disabled={uploading}
            style={{
              background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
              padding: "10px 18px", fontSize: 13, fontWeight: 700, opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? "Uploading…" : "Submit video"}
          </button>
        </div>

        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
          YOUR SUBMISSIONS
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
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
                      with {s.instructorName || "your instructor"} · {new Date(s.submittedAt).toLocaleDateString()}
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
                        No comments yet — check back once your instructor's had a chance to watch.
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
