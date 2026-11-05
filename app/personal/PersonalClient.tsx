"use client";

import { downloadVideo } from "@/lib/downloadVideo";
import ZoomFrame from "@/app/components/ZoomFrame";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { upload } from "@vercel/blob/client";

type Vid = { id: string; videoUrl: string; title: string | null; note: string | null; createdAt: string; reviews?: Review[] };
type Review = { id: string; proName: string; businessName: string; status: string; comments: { id: string; timestampSeconds: number; text: string }[] };
type Pro = { slug: string; name: string; city: string | null; state: string | null; distanceMiles: number | null; instructors: { id: string; name: string; specialty: string | null; priceCents: number; covered?: boolean }[] };


const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 };
const input: React.CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 8 };
const btn: React.CSSProperties = { background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const ghost: React.CSSProperties = { flex: 1, fontSize: 15, fontWeight: 700, color: "var(--fairway)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", cursor: "pointer" };

export default function PersonalClient() {
  const [videos, setVideos] = useState<Vid[]>([]);
  const [status, setStatus] = useState("none");
  const [hasCustomer, setHasCustomer] = useState(false);
  const [comped, setComped] = useState(false);
  const [count, setCount] = useState(0);
  const [cap, setCap] = useState(100);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [proQuery, setProQuery] = useState("");
  const [proLoading, setProLoading] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => { setIsNative(Capacitor.isNativePlatform()); }, []);

  async function load() {
    try {
      const r = await fetch("/api/personal/videos");
      const d = await r.json();
      setVideos(d.videos || []);
      setStatus(d.status || "none");
      setHasCustomer(!!d.hasCustomer);
      setComped(!!d.comped);
      setCount(d.count || 0);
      setCap(d.cap || 100);
      return (d.videos || []).length as number;
    } catch { return 0; } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const canUpload = comped || status === "active" || status === "trialing";

  async function go(path: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(path, { method: "POST" });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else setError(d.error || "Something went wrong.");
    } catch { setError("Something went wrong."); }
    setBusy(false);
  }

  async function recordVideo() {
    setError(null); setRecording(true);
    try {
      const { Camera } = await import("@capacitor/camera");
      const result = await Camera.recordVideo({ saveToGallery: true });
      const res = await fetch(result.webPath!);
      const blob = await res.blob();
      setFile(new File([blob], `swing-${Date.now()}.mp4`, { type: blob.type || "video/mp4" }));
    } catch (e) { console.error(e); } finally { setRecording(false); }
  }

  async function submit() {
    if (!file) { setError("Choose a video to upload."); return; }
    setUploading(true); setError(null);
    try {
      await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/personal/videos/upload-token",
        clientPayload: JSON.stringify({ title: title.trim() || undefined, note: note.trim() || undefined }),
      });
      setTitle(""); setNote(""); setFile(null);
      // The DB row is created by a background callback - retry a few times.
      for (let i = 0; i < 5; i++) {
        const n = await load();
        if (n > videos.length) break;
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong uploading that.");
    } finally { setUploading(false); }
  }

  async function findPros(params: string) {
    setProLoading(true); setSendMsg(null);
    try {
      const r = await fetch(`/api/personal/pros?${params}`);
      const d = await r.json();
      setPros(Array.isArray(d) ? d : []);
    } catch { setPros([]); }
    setProLoading(false);
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setSendMsg("Location isn't available - type a city instead."); return; }
    setProLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => findPros(`lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&radius=100`),
      () => { setProLoading(false); setSendMsg("Couldn't get your location - type a city instead."); },
      { timeout: 10000 }
    );
  }
  async function sendTo(videoId: string, instructorMembershipId: string) {
    setSendMsg(null);
    const r = await fetch("/api/personal/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, instructorMembershipId }),
    });
    const d = await r.json();
    if (r.ok && d.url) { window.location.href = d.url; return; }
    if (r.ok) { setSendMsg(`Sent to ${d.businessName}!`); load(); }
    else setSendMsg(d.error || "Couldn't send that.");
  }

  async function remove(id: string) {
    if (!confirm("Delete this video? This can't be undone.")) return;
    await fetch(`/api/personal/videos/${id}`, { method: "DELETE" });
    setOpenId(null);
    load();
  }

  function stepFrame(id: string, dir: 1 | -1) {
    const el = videoRefs.current[id];
    if (!el) return;
    el.pause();
    el.currentTime = Math.max(0, Math.min(el.currentTime + dir / 30, el.duration || el.currentTime + 1));
  }
  function changeSpeed(id: string, s: number) {
    setSpeed(s);
    const el = videoRefs.current[id];
    if (el) el.playbackRate = s;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--chalk)" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>BookMyPro Personal</span>
            <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>Sign out</button>
          </div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Your swing video library</h1>
          <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>
            Record, slow down, step frame by frame and zoom in. Private to you.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
        {typeof window !== "undefined" && window.location.search.includes("sent=1") && (
          <div style={{ ...card, background: "#E7F0EA", fontSize: 13, fontWeight: 700, color: "#1B3A2F" }}>Payment received. Your video is on its way to the pro.</div>
        )}
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading...</p>
        ) : (
          <>
            {!canUpload && (
              <div style={card}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                  {status === "past_due" ? "Update your payment to keep uploading" : status === "cancelled" ? "Welcome back" : "Start your free week"}
                </div>
                <p style={{ fontSize: 13, color: "var(--faint)", margin: "0 0 12px" }}>
                  Up to {cap} videos, slow-motion, frame-by-frame, zoom and downloads. $4.99/month after a 7-day free trial. Cancel any time.
                </p>
                {status === "past_due" && hasCustomer ? (
                  <button style={btn} disabled={busy} onClick={() => go("/api/personal/portal")}>Update payment</button>
                ) : (
                  <button style={btn} disabled={busy} onClick={() => go("/api/personal/checkout")}>
                    {status === "cancelled" ? "Resubscribe" : "Start free trial"}
                  </button>
                )}
                {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "10px 0 0" }}>{error}</p>}
              </div>
            )}

            {canUpload && (
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add a video</div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional) - e.g. Driver, face-on" style={input} />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes to yourself (optional)" rows={2} style={{ ...input, resize: "vertical" }} />
                {isNative && (
                  <button onClick={recordVideo} disabled={recording} style={{ ...ghost, flex: "none", width: "100%", marginBottom: 10, fontSize: 13 }}>
                    {recording ? "Opening camera..." : "🎥 Record a video"}
                  </button>
                )}
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ width: "100%", fontSize: 13, marginBottom: 6 }} />
                {file && <p style={{ fontSize: 12, color: "var(--fairway)", fontWeight: 600, margin: "0 0 10px" }}>Ready to upload: {file.name}</p>}
                {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}
                <button onClick={submit} disabled={uploading} style={{ ...btn, opacity: uploading ? 0.7 : 1 }}>{uploading ? "Uploading..." : "Save video"}</button>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{count} of {cap} videos{comped ? " - included by your pro" : status === "trialing" ? " - free trial" : ""}</span>
                  <button onClick={() => go("/api/personal/portal")} disabled={busy} style={{ background: "none", border: "none", color: "var(--fairway)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Manage plan</button>
                </div>
              </div>
            )}

            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>YOUR VIDEOS</div>
            {videos.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)" }}>Nothing saved yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {videos.map((s) => (
                  <div key={s.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ cursor: "pointer" }} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title || "Untitled video"}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{new Date(s.createdAt).toLocaleDateString()}</div>
                    </div>
                    {openId === s.id && (
                      <div style={{ marginTop: 12 }}>
                        <ZoomFrame getVideo={() => videoRefs.current[s.id] || null}>
                          <video ref={(el) => { videoRefs.current[s.id] = el; }} src={s.videoUrl} controls playsInline style={{ width: "100%", borderRadius: 8, background: "#000", display: "block" }} />
                        </ZoomFrame>
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                          <button onClick={() => stepFrame(s.id, -1)} style={ghost}>{"<"} Frame</button>
                          <button onClick={() => stepFrame(s.id, 1)} style={ghost}>Frame {">"}</button>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          {[0.25, 0.5, 1, 1.5, 2].map((sp) => (
                            <button key={sp} onClick={() => changeSpeed(s.id, sp)} style={{
                              flex: 1, fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: "8px 6px", cursor: "pointer",
                              border: speed === sp ? "1px solid var(--fairway)" : "1px solid var(--border)",
                              background: speed === sp ? "var(--fairway)" : "var(--card)",
                              color: speed === sp ? "var(--chalk)" : "var(--fairway)",
                            }}>{sp}x</button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                          <button onClick={() => downloadVideo(s.videoUrl, `${s.title || "swing-video"}.mp4`)} style={{ fontSize: 12, fontWeight: 700, color: "var(--fairway)", background: "none", border: "none", padding: "6px 0", cursor: "pointer" }}>Download</button>
                          <button onClick={() => { setSendFor(sendFor === s.id ? null : s.id); setPros(null); setSendMsg(null); }} style={{ fontSize: 12, fontWeight: 700, color: "var(--fairway)", background: "none", border: "none", padding: "6px 0", cursor: "pointer" }}>Send to a pro</button>
                          <button onClick={() => remove(s.id)} style={{ fontSize: 12, fontWeight: 700, color: "#B23A3A", background: "none", border: "none", padding: "6px 0", cursor: "pointer" }}>Delete</button>
                        </div>
                        {sendFor === s.id && (
                          <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Find an instructor</div>
                            <button onClick={useMyLocation} style={{ ...btn, width: "100%", marginBottom: 8 }}>Find pros near me</button>
                            <div style={{ display: "flex", gap: 6 }}>
                              <input value={proQuery} onChange={(e) => setProQuery(e.target.value)} placeholder="Or type a city, state or name" style={{ ...input, marginBottom: 0 }} />
                              <button onClick={() => findPros(`q=${encodeURIComponent(proQuery)}`)} style={{ ...btn, padding: "8px 14px" }}>Search</button>
                            </div>
                            {proLoading && <p style={{ fontSize: 12, color: "var(--faint)", margin: "8px 0 0" }}>Searching...</p>}
                            {sendMsg && <p style={{ fontSize: 12, fontWeight: 700, color: sendMsg.startsWith("Sent") ? "var(--fairway)" : "#B23A3A", margin: "8px 0 0" }}>{sendMsg}</p>}
                            {pros && pros.length === 0 && !proLoading && <p style={{ fontSize: 12, color: "var(--faint)", margin: "8px 0 0" }}>No pros found. Try a wider search.</p>}
                            {pros && pros.map((b) => (
                              <div key={b.slug} style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>{b.name}</div>
                                <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                                  {[b.city, b.state].filter(Boolean).join(", ")}{b.distanceMiles != null ? ` - ${Math.round(b.distanceMiles)} mi` : ""}
                                </div>
                                {b.instructors.map((i) => (
                                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
                                    <div style={{ fontSize: 12.5 }}>{i.name}{i.specialty ? <span style={{ color: "var(--faint)" }}> - {i.specialty}</span> : null}</div>
                                    <button onClick={() => sendTo(s.id, i.id)} style={{ ...btn, padding: "6px 12px", fontSize: 12 }}>{i.covered ? "Send (included)" : i.priceCents > 0 ? `Pay $${(i.priceCents / 100).toFixed(i.priceCents % 100 ? 2 : 0)} & send` : "Send free"}</button>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                        {s.reviews && s.reviews.length > 0 && (
                          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                            {s.reviews.map((r) => (
                              <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.proName}<span style={{ fontWeight: 400, color: "var(--faint)" }}> - {r.businessName}</span></div>
                                  <span className="mono" style={{
                                    fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "3px 6px",
                                    color: r.status === "reviewed" ? "#1B3A2F" : "#9A7A1E",
                                    background: r.status === "reviewed" ? "#E7F0EA" : "#FBF3DE",
                                  }}>{r.status === "reviewed" ? "REVIEWED" : "WAITING"}</span>
                                </div>
                                {r.comments.length > 0 ? (
                                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                    {r.comments.map((c) => (
                                      <button key={c.id} onClick={() => { const el = videoRefs.current[s.id]; if (el) { el.pause(); el.currentTime = c.timestampSeconds; } }}
                                        style={{ display: "flex", gap: 8, textAlign: "left", background: "#FFF", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                                        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", flexShrink: 0 }}>
                                          {Math.floor(c.timestampSeconds / 60)}:{Math.floor(c.timestampSeconds % 60).toString().padStart(2, "0")}
                                        </span>
                                        <span style={{ fontSize: 13 }}>{c.text}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p style={{ fontSize: 12, color: "var(--faint)", margin: "6px 0 0" }}>
                                    {r.status === "reviewed" ? "Reviewed with no timestamped comments." : "No feedback yet - check back soon."}
                                  </p>
                                )}
                              </div>
                            ))}
                            {s.reviews.some((r) => r.status === "reviewed") && (
                              <button onClick={() => { setSendFor(s.id); setPros(null); setSendMsg(null); }} style={{ background: "none", border: "none", color: "var(--fairway)", fontSize: 12, fontWeight: 700, textAlign: "left", padding: 0, cursor: "pointer" }}>
                                Want a second opinion? Send it to another pro
                              </button>
                            )}
                          </div>
                        )}
                        {s.note && <p style={{ fontSize: 12, color: "var(--faint)", margin: "6px 0 0", fontStyle: "italic" }}>{s.note}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
