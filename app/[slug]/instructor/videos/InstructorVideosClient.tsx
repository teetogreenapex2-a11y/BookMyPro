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

export default function InstructorVideosClient({ slug, basePath, apiBase }: { slug: string; basePath: string; apiBase: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function load() {
    fetch(`${apiBase}/videos`).then((r) => r.json()).then((list) => {
      const shaped = Array.isArray(list) ? list : [];
      setSubmissions(shaped);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => {
    load();
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
              ← Back to dashboard
            </a>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Review submissions</h1>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px 60px", background: "var(--chalk)", borderRadius: "16px 16px 0 0", minHeight: "60vh" }}>
        <div style={{ display: "flex", gap: 20, paddingTop: 20, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 240 }}>
            {loading ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
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
                  {selected.playerName} · {new Date(selected.submittedAt).toLocaleDateString()}
                </div>
                {selected.playerNote && (
                  <p style={{ fontSize: 13, color: "var(--faint)", fontStyle: "italic", marginBottom: 10 }}>
                    "{selected.playerNote}"
                  </p>
                )}
                <video ref={videoRef} src={selected.videoUrl} controls style={{ width: "100%", borderRadius: 8, background: "#000", marginBottom: 12 }} />

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Comment at the current point in the video…"
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
