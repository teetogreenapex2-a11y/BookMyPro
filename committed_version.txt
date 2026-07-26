"use client";

import { useEffect, useRef, useState } from "react";

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

  function loadPlayers() {
    fetch(`${apiBase}/players`).then((r) => r.json()).then((list) => setPlayers(Array.isArray(list) ? list : [])).catch(() => {});
  }

  async function uploadVideo(file: File) {
    if (!uploadPlayerId) {
      setUploadError("Choose which player this is for first.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("video", file);
    form.append("instructorMembershipId", viewerMembershipId);
    form.append("playerId", uploadPlayerId);
    if (uploadTitle.trim()) form.append("title", uploadTitle.trim());
    const res = await fetch(`${apiBase}/videos`, { method: "POST", body: form });
    setUploading(false);
    if (res.ok) {
      setUploadOpen(false);
      setUploadPlayerId("");
      setUploadTitle("");
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setUploadError(data.error || "Something went wrong.");
    }
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
              <- Back to dashboard
            </a>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Review submissions</h1>
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
                  placeholder="Title (optional) - e.g. \"Driver, face-on\""
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
                />
                {uploadError && <p style={{ fontSize: 12, color: "#B23A3A", margin: 0 }}>{uploadError}</p>}
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
                <button
                  onClick={() => downloadVideo(selected.videoUrl, `${selected.title || selected.playerName || "swing-video"}.mp4`)}
                  style={{ fontSize: 11.5, fontWeight: 700, color: "var(--fairway)", background: "none", border: "none", padding: "0 0 12px", cursor: "pointer" }}
                >
                  v Download
                </button>

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
                      <div key={c.id} style={{ display: "flex", gap: 8, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
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
