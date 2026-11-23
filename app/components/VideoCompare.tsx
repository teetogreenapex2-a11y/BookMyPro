"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

export type CompareNote = { t: number; text: string };
export type CompareClip = {
  id: string;
  url: string;
  label: string;
  date?: string | null;
  club?: string | null;
  impact?: number | null; // seconds into the video, when known
  voiceUrl?: string | null;
  comments?: CompareNote[];
  playerId?: string | null;
};

const FRAME = 1 / 30;
const CLUBS: [string, RegExp][] = [
  ["Driver", /\bdriver\b|\b1\s?w(ood)?\b/i],
  ["Woods", /\bwoods?\b|\b[2-9]\s?w\b|fairway/i],
  ["Hybrid", /\bhybrids?\b|\brescue\b/i],
  ["Irons", /\birons?\b|\b[2-9]\s?i\b|\b[2-9]-iron\b/i],
  ["Wedges", /\bwedges?\b|\b(pw|gw|sw|lw)\b|\b(46|48|50|52|54|56|58|60)\s?(deg|°)/i],
  ["Putter", /\bputt(er|ing)?\b/i],
];

// Best guess at the club from a video's title, e.g. "7 iron, face-on" -> Irons.
export function guessClub(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const [name, re] of CLUBS) if (re.test(title)) return name;
  return null;
}

// Turns a swing video row (player or instructor view) into a compare clip.
export function submissionToClip(x: any): CompareClip {
  return {
    id: x.id,
    url: x.videoUrl,
    label: `${x.title || "Swing"} · ${new Date(x.submittedAt).toLocaleDateString()}`,
    date: x.submittedAt,
    club: guessClub(x.title),
    voiceUrl: x.voiceNoteUrl || null,
    playerId: x.playerId || null,
    comments: Array.isArray(x.comments) ? x.comments.map((c: any) => ({ t: Number(c.timestampSeconds) || 0, text: String(c.text || "") })) : [],
  };
}

// ---------- drawing ----------
type Pt = { x: number; y: number };
type Shape =
  | { k: "line"; a: Pt; b: Pt; c: string }
  | { k: "circle"; a: Pt; r: number; c: string }
  | { k: "pen"; pts: Pt[]; c: string }
  | { k: "angle"; a: Pt; v: Pt; b: Pt; c: string };
type Tool = "none" | "line" | "angle" | "circle" | "pen";

function angleDeg(a: Pt, v: Pt, b: Pt, ar: number) {
  const ux = (a.x - v.x) * ar, uy = a.y - v.y, wx = (b.x - v.x) * ar, wy = b.y - v.y;
  const dot = ux * wx + uy * wy;
  const m = Math.hypot(ux, uy) * Math.hypot(wx, wy);
  if (!m) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

// Draws shapes (coordinates 0-1) into a w x h box whose top-left is (ox, oy).
function paintShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], ox: number, oy: number, w: number, h: number) {
  const ar = w / h;
  const P = (p: Pt) => [ox + p.x * w, oy + p.y * h] as const;
  const lw = Math.max(2, w / 220);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  for (const s of shapes) {
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.beginPath();
    if (s.k === "line") {
      const [x1, y1] = P(s.a), [x2, y2] = P(s.b);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (s.k === "circle") {
      const [cx, cy] = P(s.a);
      ctx.arc(cx, cy, s.r * w, 0, Math.PI * 2); ctx.stroke();
    } else if (s.k === "pen") {
      s.pts.forEach((p, i) => { const [x, y] = P(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    } else if (s.k === "angle") {
      const [x1, y1] = P(s.a), [vx, vy] = P(s.v), [x2, y2] = P(s.b);
      ctx.moveTo(x1, y1); ctx.lineTo(vx, vy); ctx.lineTo(x2, y2); ctx.stroke();
      const deg = angleDeg(s.a, s.v, s.b, ar);
      const fs = Math.max(13, w / 28);
      ctx.font = `700 ${fs}px sans-serif`;
      const label = `${deg.toFixed(0)}°`;
      const tx = vx + fs * 0.6, ty = vy - fs * 0.6;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(label, tx, ty);
      ctx.fillStyle = s.c; ctx.fillText(label, tx, ty);
      ctx.lineWidth = lw;
    }
  }
}

function DrawLayer({ shapes, tool, color, onCommit, ar }: { shapes: Shape[]; tool: Tool; color: string; onCommit: (s: Shape) => void; ar: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [pending, setPending] = useState<Pt[]>([]);
  const down = useRef(false);

  function paint() {
    const cv = ref.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const all: Shape[] = [...shapes];
    if (draft) all.push(draft);
    paintShapes(ctx, all, 0, 0, W, H);
    // the points of an angle that is still being placed
    ctx.fillStyle = color;
    for (const p of pending) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, Math.max(4, W / 90), 0, Math.PI * 2); ctx.fill(); }
    if (pending.length === 2) {
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, W / 220); ctx.beginPath();
      ctx.moveTo(pending[0].x * W, pending[0].y * H); ctx.lineTo(pending[1].x * W, pending[1].y * H); ctx.stroke();
    }
  }
  useEffect(() => {
    paint();
    const cv = ref.current;
    if (!cv || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(cv);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, draft, pending, color]);
  useEffect(() => { setPending([]); setDraft(null); }, [tool]);

  function pt(e: React.PointerEvent): Pt {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  }
  function onDown(e: React.PointerEvent) {
    if (tool === "none") return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
    const p = pt(e);
    if (tool === "angle") {
      const next = [...pending, p];
      if (next.length === 3) { onCommit({ k: "angle", a: next[0], v: next[1], b: next[2], c: color }); setPending([]); } else setPending(next);
      return;
    }
    down.current = true;
    if (tool === "line") setDraft({ k: "line", a: p, b: p, c: color });
    else if (tool === "circle") setDraft({ k: "circle", a: p, r: 0, c: color });
    else if (tool === "pen") setDraft({ k: "pen", pts: [p], c: color });
  }
  function onMove(e: React.PointerEvent) {
    if (!down.current || !draft) return;
    const p = pt(e);
    if (draft.k === "line") setDraft({ ...draft, b: p });
    else if (draft.k === "circle") setDraft({ ...draft, r: Math.hypot(p.x - draft.a.x, (p.y - draft.a.y) / ar) });
    else if (draft.k === "pen") setDraft({ ...draft, pts: [...draft.pts, p] });
  }
  function onUp() {
    if (!down.current) return;
    down.current = false;
    if (draft) {
      const tiny = (draft.k === "line" && Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y) < 0.01) || (draft.k === "circle" && draft.r < 0.005) || (draft.k === "pen" && draft.pts.length < 2);
      if (!tiny) onCommit(draft);
    }
    setDraft(null);
  }
  return (
    <canvas
      ref={ref}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: tool === "none" ? "auto" : "none", pointerEvents: tool === "none" ? "none" : "auto", cursor: tool === "none" ? "default" : "crosshair" }}
    />
  );
}

// ---------- helpers ----------
function containRect(vw: number, vh: number, bx: number, by: number, bw: number, bh: number) {
  if (!vw || !vh) return { x: bx, y: by, w: bw, h: bh };
  const s = Math.min(bw / vw, bh / vh);
  const w = vw * s, h = vh * s;
  return { x: bx + (bw - w) / 2, y: by + (bh - h) / 2, w, h };
}
function waitSeeked(v: HTMLVideoElement) {
  return new Promise<void>((res) => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener("seeked", fin); res(); };
    v.addEventListener("seeked", fin);
    setTimeout(fin, 1500);
  });
}
async function seekTo(v: HTMLVideoElement | null, t: number) {
  if (!v) return;
  const target = Math.max(0, Math.min(v.duration || 0, t));
  if (Math.abs(v.currentTime - target) < 0.001) return;
  const p = waitSeeked(v);
  v.currentTime = target;
  await p;
}
function readImpact(id: string, fallback?: number | null): number | null {
  try {
    const raw = window.localStorage.getItem(`bmp_impact_${id}`);
    if (raw !== null && raw !== "" && isFinite(Number(raw))) return Number(raw);
  } catch {}
  return fallback != null && isFinite(fallback) ? fallback : null;
}
const COLORS = ["#FFD23F", "#FF4D4D", "#3DDC84", "#4DA3FF", "#FFFFFF"];

// Two swings next to each other (or on top of each other) with shared controls.
export default function VideoCompare({
  clips, initialId, initialRightId, onClose, onAddNote, sketchApiBase,
}: {
  clips: CompareClip[]; initialId: string; initialRightId?: string; onClose: () => void;
  onAddNote?: (clipId: string, t: number, text: string) => Promise<void>;
  sketchApiBase?: string; // instructors only: lets a frame be saved as a Swing Sketch
}) {
  const [leftId, setLeftId] = useState(initialId);
  const [rightId, setRightId] = useState(() => (initialRightId && clips.some((c) => c.id === initialRightId) ? initialRightId : clips.find((c) => c.id !== initialId)?.id) || initialId);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [native, setNative] = useState(false);
  const [mode, setMode] = useState<"side" | "overlay">("side");
  const [ghost, setGhost] = useState(0.5);
  const [club, setClub] = useState("all");
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState<{ L: Shape[]; R: Shape[]; O: Shape[] }>({ L: [], R: [], O: [] });
  const [impacts, setImpacts] = useState<Record<string, number | null>>({});
  const [rel, setRel] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; ext: string; type: string } | null>(null);
  const [savingSketch, setSavingSketch] = useState(false);
  useEffect(() => { setNative(Capacitor.isNativePlatform()); }, []);

  const lv = useRef<HTMLVideoElement | null>(null);
  const rv = useRef<HTMLVideoElement | null>(null);
  const av = useRef<HTMLAudioElement | null>(null);
  const ltRef = useRef(0);
  const rtRef = useRef(0);
  const cancelExport = useRef(false);
  const [lt, setLt] = useState(0);
  const [rt, setRt] = useState(0);
  const [ld, setLd] = useState(0);
  const [rd, setRd] = useState(0);
  const [lar, setLar] = useState(9 / 16);
  const [rar, setRar] = useState(9 / 16);

  const left = clips.find((c) => c.id === leftId) || clips[0];
  const right = clips.find((c) => c.id === rightId) || clips[0];

  const clubs = useMemo(() => Array.from(new Set(clips.map((c) => c.club).filter(Boolean))) as string[], [clips]);
  const shown = useMemo(() => {
    if (club === "all") return clips;
    return clips.filter((c) => c.club === club || c.id === leftId || c.id === rightId);
  }, [clips, club, leftId, rightId]);

  // Saved impact marks (this device) plus any the video already carries.
  useEffect(() => {
    const m: Record<string, number | null> = {};
    for (const c of clips) m[c.id] = readImpact(c.id, c.impact);
    setImpacts(m);
  }, [clips]);
  const impL = impacts[left.id] ?? null;
  const impR = impacts[right.id] ?? null;
  const aligned = impL != null && impR != null;
  const lead = aligned ? Math.min(impL as number, impR as number, 2) : 0;
  const tail = aligned ? Math.max(0.3, Math.min(ld - (impL as number), rd - (impR as number), 2)) : 0;

  useEffect(() => { if (lv.current) lv.current.playbackRate = rate; if (rv.current) rv.current.playbackRate = rate; }, [rate, leftId, rightId, mode]);
  useEffect(() => { if (av.current) av.current.playbackRate = rate; }, [rate]);
  useEffect(() => { pauseBoth(); setRel(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leftId, rightId]);

  const voiceClip = left.voiceUrl ? left : right.voiceUrl ? right : null;
  const voiceOwner = voiceClip === right && voiceClip !== left ? rv : lv;

  function syncAudio() {
    const a = av.current;
    if (!a || !voiceClip || !voiceOn) return;
    const src = voiceOwner.current;
    if (src) a.currentTime = src.currentTime;
  }
  function playBoth() {
    lv.current?.play().catch(() => {});
    rv.current?.play().catch(() => {});
    if (voiceClip && voiceOn && av.current) { syncAudio(); av.current.play().catch(() => {}); }
    setPlaying(true);
  }
  function pauseBoth() {
    lv.current?.pause();
    rv.current?.pause();
    av.current?.pause();
    setPlaying(false);
  }
  // Both swings start just before impact so the two impacts land together.
  async function playAligned() {
    if (!aligned) { playBoth(); return; }
    pauseBoth();
    await Promise.all([seekTo(lv.current, (impL as number) - lead), seekTo(rv.current, (impR as number) - lead)]);
    playBoth();
  }
  function step(v: HTMLVideoElement | null, dir: number) {
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + dir * FRAME));
  }
  function stepBoth(dir: number) { pauseBoth(); step(lv.current, dir); step(rv.current, dir); }
  async function scrubRel(r: number) {
    pauseBoth();
    setRel(r);
    await Promise.all([seekTo(lv.current, (impL as number) + r), seekTo(rv.current, (impR as number) + r)]);
  }
  function markImpact(which: "L" | "R") {
    const v = which === "L" ? lv.current : rv.current;
    const clip = which === "L" ? left : right;
    if (!v) return;
    const t = Math.round(v.currentTime * 100) / 100;
    try { window.localStorage.setItem(`bmp_impact_${clip.id}`, String(t)); } catch {}
    setImpacts((m) => ({ ...m, [clip.id]: t }));
    setMsg(`Impact marked at ${t.toFixed(2)}s on the ${which === "L" ? "left" : "right"} video.`);
  }
  function clearImpact(which: "L" | "R") {
    const clip = which === "L" ? left : right;
    try { window.localStorage.removeItem(`bmp_impact_${clip.id}`); } catch {}
    setImpacts((m) => ({ ...m, [clip.id]: clip.impact ?? null }));
  }

  // ---------- drawing ----------
  function commit(key: "L" | "R" | "O", s: Shape) { setShapes((m) => ({ ...m, [key]: [...m[key], s] })); }
  function undo() {
    setShapes((m) => {
      const k = (["O", "R", "L"] as const).find((x) => (mode === "overlay" ? x === "O" : x !== "O") && m[x].length > 0);
      return k ? { ...m, [k]: m[k].slice(0, -1) } : m;
    });
  }
  function clearDrawing() { setShapes({ L: [], R: [], O: [] }); setTool("none"); }
  const hasDrawing = shapes.L.length + shapes.R.length + shapes.O.length > 0;

  // ---------- composite image (used by export and Swing Sketch) ----------
  function paintComposite(ctx: CanvasRenderingContext2D, W: number, H: number, withShapes: boolean, withLabels: boolean) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const barH = withLabels ? Math.round(H * 0.075) : 0;
    const bodyH = H - barH;
    const L = lv.current, R = rv.current;
    if (mode === "side") {
      const cw = W / 2;
      ([[L, left, 0, "L"], [R, right, cw, "R"]] as const).forEach(([v, clip, x0, key]) => {
        if (!v) return;
        const rc = containRect(v.videoWidth, v.videoHeight, x0, 0, cw, bodyH);
        try { ctx.drawImage(v, rc.x, rc.y, rc.w, rc.h); } catch {}
        if (withShapes) paintShapes(ctx, shapes[key], rc.x, rc.y, rc.w, rc.h);
        if (withLabels) {
          ctx.fillStyle = "#0F1A15"; ctx.fillRect(x0, bodyH, cw, barH);
          ctx.fillStyle = "#FFF"; ctx.font = `600 ${Math.round(barH * 0.42)}px sans-serif`; ctx.textBaseline = "middle";
          ctx.fillText(clip.label.slice(0, 48), x0 + 14, bodyH + barH / 2);
        }
      });
    } else if (L && R) {
      const st = containRect(L.videoWidth, L.videoHeight, 0, 0, W, bodyH);
      try { ctx.drawImage(L, st.x, st.y, st.w, st.h); } catch {}
      const rr = containRect(R.videoWidth, R.videoHeight, st.x, st.y, st.w, st.h);
      ctx.globalAlpha = ghost;
      try { ctx.drawImage(R, rr.x, rr.y, rr.w, rr.h); } catch {}
      ctx.globalAlpha = 1;
      if (withShapes) paintShapes(ctx, shapes.O, st.x, st.y, st.w, st.h);
      if (withLabels) {
        ctx.fillStyle = "#0F1A15"; ctx.fillRect(0, bodyH, W, barH);
        ctx.fillStyle = "#FFF"; ctx.font = `600 ${Math.round(barH * 0.42)}px sans-serif`; ctx.textBaseline = "middle";
        ctx.fillText(`${left.label.slice(0, 30)}  over  ${right.label.slice(0, 30)}`, 14, bodyH + barH / 2);
      }
    }
  }
  function compositeSize(maxW: number) {
    const L = lv.current;
    const a = Math.max(0.3, Math.min(2.5, (L && L.videoWidth ? L.videoHeight / L.videoWidth : lar) || lar));
    const W = mode === "side" ? maxW : Math.round(maxW * 0.75);
    const cw = mode === "side" ? W / 2 : W;
    const H = Math.round(cw * a / 0.925);
    return { W: Math.round(W / 2) * 2, H: Math.round(H / 2) * 2 };
  }

  async function exportVideo() {
    const L = lv.current, R = rv.current;
    if (!L || !R || typeof MediaRecorder === "undefined") { setMsg("This browser can't save video. Try Chrome or Safari."); return; }
    pauseBoth(); setMsg(null); setResult(null); cancelExport.current = false;
    const { W, H } = compositeSize(1280);
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const stream: MediaStream = (cv as any).captureStream(30);
    let actx: AudioContext | null = null;
    let voice: HTMLAudioElement | null = null;
    try {
      if (voiceClip && voiceOn) {
        voice = new Audio();
        voice.crossOrigin = "anonymous";
        voice.src = voiceClip.voiceUrl as string;
        actx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const srcNode = actx.createMediaElementSource(voice);
        const dest = actx.createMediaStreamDestination();
        srcNode.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      }
    } catch { voice = null; }
    const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined); } catch { setMsg("Couldn't start saving on this device."); return; }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const finished = new Promise<void>((res) => { rec.onstop = () => res(); });

    const startL = aligned ? (impL as number) - lead : 0;
    const startR = aligned ? (impR as number) - lead : 0;
    await Promise.all([seekTo(L, startL), seekTo(R, startR)]);
    L.playbackRate = rate; R.playbackRate = rate;
    setExporting(0);
    rec.start(250);
    const t0 = performance.now();
    await Promise.all([L.play().catch(() => {}), R.play().catch(() => {})]);
    if (voice && actx) {
      try { await actx.resume(); voice.currentTime = voiceOwner.current?.currentTime || 0; voice.playbackRate = rate; await voice.play(); } catch {}
    }
    await new Promise<void>((resolve) => {
      const tick = () => {
        paintComposite(ctx, W, H, true, true);
        const lDone = L.ended || L.paused, rDone = R.ended || R.paused;
        const vDone = !voice || voice.ended || voice.paused;
        const frac = Math.max((L.currentTime - startL) / Math.max(0.1, (L.duration || 1) - startL), (R.currentTime - startR) / Math.max(0.1, (R.duration || 1) - startR));
        setExporting(Math.max(0, Math.min(0.99, frac)));
        if (cancelExport.current || (lDone && rDone && vDone) || performance.now() - t0 > 190000) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
    L.pause(); R.pause(); voice?.pause();
    rec.stop();
    await finished;
    stream.getTracks().forEach((t) => t.stop());
    try { await actx?.close(); } catch {}
    setExporting(null);
    if (cancelExport.current) return;
    const type = (rec.mimeType || mime || "video/webm").split(";")[0];
    const blob = new Blob(chunks, { type });
    setResult({ url: URL.createObjectURL(blob), ext: type.includes("mp4") ? "mp4" : "webm", type });
  }

  async function shareResult() {
    if (!result) return;
    try {
      const blob = await (await fetch(result.url)).blob();
      const file = new File([blob], `swing-compare.${result.ext}`, { type: result.type });
      const nav: any = navigator;
      if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: "Swing comparison" }); return; }
    } catch {}
    setMsg("Press and hold the video above and choose Save, or use Save to device.");
  }

  async function saveToSketch() {
    const L = lv.current;
    const pid = left.playerId || right.playerId;
    if (!sketchApiBase || !L) return;
    if (!pid) { setMsg("Couldn't tell which student this is for."); return; }
    pauseBoth();
    setSavingSketch(true); setMsg(null);
    try {
      const { W, H } = compositeSize(1280);
      const mk = (withShapes: boolean) => {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d")!; paintComposite(x, W, H, withShapes, false);
        return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
      };
      const [marked, plain] = await Promise.all([mk(true), mk(false)]);
      const up = async (b: Blob) => {
        const fd = new FormData(); fd.append("source", new File([b], "frame.png", { type: "image/png" }));
        const r = await fetch(`${sketchApiBase}/swing-sketches/upload-source`, { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.url) throw new Error(d.error || "Upload failed");
        return d.url as string;
      };
      const [imageUrl, sourceUrl] = await Promise.all([up(marked), up(plain)]);
      const r = await fetch(`${sketchApiBase}/swing-sketches`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: pid, imageUrl, sourceUrl, shapesJson: "[]", label: `Comparison · ${left.label} vs ${right.label}`.slice(0, 120) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't save");
      setMsg("Saved to this student's Swing Sketches.");
    } catch (e: any) {
      setMsg(e?.message || "Couldn't save the sketch. Make sure the videos finished loading and try again.");
    }
    setSavingSketch(false);
  }

  // ---------- notes ----------
  async function addNote(which: "L" | "R") {
    const v = which === "L" ? lv.current : rv.current;
    const clip = which === "L" ? left : right;
    if (!v || !noteText.trim() || !onAddNote) return;
    setNoteBusy(true);
    try { await onAddNote(clip.id, v.currentTime, noteText.trim()); setNoteText(""); setMsg("Note added at this moment."); } catch { setMsg("Couldn't add the note."); }
    setNoteBusy(false);
  }
  function nearNote(clip: CompareClip, t: number) {
    return (clip.comments || []).find((n) => Math.abs(n.t - t) < 0.5) || null;
  }

  const btn = (active = false, small = false): React.CSSProperties => ({
    background: active ? "#B8862B" : "rgba(255,255,255,0.12)", color: "#FFF", border: "none", borderRadius: 8,
    padding: small ? "7px 10px" : "9px 12px", fontSize: small ? 12 : 13, fontWeight: 700, cursor: "pointer", minWidth: small ? 0 : 40,
  });
  const sel: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.1)", color: "#FFF", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 6px", fontSize: 12 };

  const videoEl = (which: "L" | "R", clip: CompareClip, style: React.CSSProperties) => {
    const ref = which === "L" ? lv : rv;
    const tRef = which === "L" ? ltRef : rtRef;
    return (
      <video
        key={`${clip.id}${which}${mode}`}
        ref={ref}
        src={clip.url}
        crossOrigin="anonymous"
        playsInline
        muted
        preload="auto"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (which === "L") { setLd(v.duration || 0); setLar(v.videoWidth ? v.videoHeight / v.videoWidth : 9 / 16); } else { setRd(v.duration || 0); setRar(v.videoWidth ? v.videoHeight / v.videoWidth : 9 / 16); }
          v.playbackRate = rate;
          if (tRef.current > 0 && tRef.current < (v.duration || 0)) v.currentTime = tRef.current;
        }}
        onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; tRef.current = t; if (which === "L") setLt(t); else setRt(t); }}
        onEnded={() => { if (lv.current?.ended && rv.current?.ended) setPlaying(false); }}
        style={style}
      />
    );
  };

  const markerRow = (clip: CompareClip, d: number, imp: number | null) => (
    <div style={{ position: "relative", height: 0 }}>
      {d > 0 && imp != null && <div title="Impact" style={{ position: "absolute", left: `${(imp / d) * 100}%`, top: -22, width: 3, height: 16, background: "#FFD23F", borderRadius: 2, transform: "translateX(-1px)" }} />}
      {d > 0 && (clip.comments || []).map((n, i) => <div key={i} title={n.text} style={{ position: "absolute", left: `${(n.t / d) * 100}%`, top: -22, width: 8, height: 8, background: "#4DA3FF", borderRadius: "50%", transform: "translateX(-4px)" }} />)}
    </div>
  );

  const side = (which: "L" | "R", clip: CompareClip, t: number, d: number, ar: number, imp: number | null, setId: (id: string) => void) => {
    const ref = which === "L" ? lv : rv;
    const note = nearNote(clip, t);
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <select value={clip.id} onChange={(e) => { setId(e.target.value); setPlaying(false); (which === "L" ? ltRef : rtRef).current = 0; }} style={sel}>
          {shown.map((c) => <option key={c.id} value={c.id} style={{ color: "#000" }}>{c.label}</option>)}
        </select>
        <div style={{ position: "relative", width: "100%", maxWidth: `${48 * (1 / ar)}vh`, margin: "0 auto", aspectRatio: `${1 / ar}`, background: "#000", borderRadius: 8, overflow: "hidden" }}>
          {videoEl(which, clip, { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#000" })}
          <DrawLayer shapes={shapes[which]} tool={tool} color={color} ar={1 / ar} onCommit={(s) => commit(which, s)} />
          {note && <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, background: "rgba(0,0,0,0.72)", color: "#FFF", fontSize: 12, padding: "5px 8px", borderRadius: 6, pointerEvents: "none" }}>{note.text}</div>}
        </div>
        <div style={{ paddingTop: 22 }}>
          {markerRow(clip, d, imp)}
          <input
            type="range" min={0} max={d || 1} step={0.01} value={Math.min(t, d || 1)}
            onChange={(e) => { pauseBoth(); const v = parseFloat(e.target.value); if (ref.current) ref.current.currentTime = v; (which === "L" ? ltRef : rtRef).current = v; (which === "L" ? setLt : setRt)(v); }}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          <button style={btn(false, true)} onClick={() => { pauseBoth(); step(ref.current, -1); }} aria-label="Back one frame">◀ 1</button>
          <span style={{ color: "#D7DED9", fontSize: 12, minWidth: 44, textAlign: "center" }}>{t.toFixed(2)}s</span>
          <button style={btn(false, true)} onClick={() => { pauseBoth(); step(ref.current, 1); }} aria-label="Forward one frame">1 ▶</button>
          <button style={btn(imp != null, true)} onClick={() => markImpact(which)}>{imp != null ? `Impact ${imp.toFixed(2)}s` : "Mark impact"}</button>
          {imp != null && <button style={{ ...btn(false, true), padding: "7px 8px" }} onClick={() => clearImpact(which)} aria-label="Clear impact mark">✕</button>}
        </div>
      </div>
    );
  };

  const ovAr = lar;
  const exportBusy = exporting !== null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10002, background: "#0F1A15", overflowY: "auto", fontFamily: "sans-serif", padding: `14px 12px ${native ? 130 : 24}px` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: "#FFF", fontSize: 17, fontWeight: 700 }}>Compare swings</div>
        <button style={btn()} onClick={() => { pauseBoth(); cancelExport.current = true; onClose(); }}>Close</button>
      </div>
      {clips.length < 2 && <div style={{ color: "#D7DED9", fontSize: 13, marginBottom: 10 }}>You need at least two videos to compare. Upload another and it will show up here.</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button style={btn(mode === "side", true)} onClick={() => { pauseBoth(); setMode("side"); }}>Side by side</button>
        <button style={btn(mode === "overlay", true)} onClick={() => { pauseBoth(); setMode("overlay"); }}>Overlay</button>
        {clubs.length > 0 && (
          <select value={club} onChange={(e) => setClub(e.target.value)} style={{ ...sel, width: "auto", minWidth: 110 }}>
            <option value="all" style={{ color: "#000" }}>All clubs</option>
            {clubs.map((c) => <option key={c} value={c} style={{ color: "#000" }}>{c}</option>)}
          </select>
        )}
      </div>

      {mode === "side" ? (
        <div style={{ display: "flex", gap: 8 }}>
          {side("L", left, lt, ld, lar, impL, setLeftId)}
          {side("R", right, rt, rd, rar, impR, setRightId)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={left.id} onChange={(e) => setLeftId(e.target.value)} style={sel}>{shown.map((c) => <option key={c.id} value={c.id} style={{ color: "#000" }}>Base: {c.label}</option>)}</select>
            <select value={right.id} onChange={(e) => setRightId(e.target.value)} style={sel}>{shown.map((c) => <option key={c.id} value={c.id} style={{ color: "#000" }}>Ghost: {c.label}</option>)}</select>
          </div>
          <div style={{ position: "relative", width: "100%", maxWidth: `${56 * (1 / ovAr)}vh`, margin: "0 auto", aspectRatio: `${1 / ovAr}`, background: "#000", borderRadius: 8, overflow: "hidden" }}>
            {videoEl("L", left, { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" })}
            {videoEl("R", right, { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: ghost })}
            <DrawLayer shapes={shapes.O} tool={tool} color={color} ar={1 / ovAr} onCommit={(s) => commit("O", s)} />
          </div>
          <label style={{ color: "#D7DED9", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            Ghost video
            <input type="range" min={0.1} max={0.9} step={0.05} value={ghost} onChange={(e) => setGhost(parseFloat(e.target.value))} style={{ flex: 1 }} />
            {Math.round(ghost * 100)}%
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ paddingTop: 22 }}>{markerRow(left, ld, impL)}<input type="range" min={0} max={ld || 1} step={0.01} value={Math.min(lt, ld || 1)} onChange={(e) => { pauseBoth(); const v = parseFloat(e.target.value); if (lv.current) lv.current.currentTime = v; ltRef.current = v; setLt(v); }} style={{ width: "100%" }} /></div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#D7DED9", fontSize: 12 }}>Base {lt.toFixed(2)}s</span>
                <button style={btn(impL != null, true)} onClick={() => markImpact("L")}>{impL != null ? `Impact ${impL.toFixed(2)}s` : "Mark impact"}</button>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ paddingTop: 22 }}>{markerRow(right, rd, impR)}<input type="range" min={0} max={rd || 1} step={0.01} value={Math.min(rt, rd || 1)} onChange={(e) => { pauseBoth(); const v = parseFloat(e.target.value); if (rv.current) rv.current.currentTime = v; rtRef.current = v; setRt(v); }} style={{ width: "100%" }} /></div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#D7DED9", fontSize: 12 }}>Ghost {rt.toFixed(2)}s</span>
                <button style={btn(impR != null, true)} onClick={() => markImpact("R")}>{impR != null ? `Impact ${impR.toFixed(2)}s` : "Mark impact"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aligned ? (
        <div style={{ margin: "12px 0 4px" }}>
          <div style={{ color: "#FFD23F", fontSize: 12, fontWeight: 700, textAlign: "center" }}>Synced at impact — drag to move both swings together</div>
          <input type="range" min={-lead} max={tail} step={0.01} value={Math.max(-lead, Math.min(tail, rel))} onChange={(e) => scrubRel(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>
      ) : (
        <div style={{ color: "#9FB0A6", fontSize: 12, textAlign: "center", margin: "12px 0 8px" }}>
          Tip: tap <strong>Mark impact</strong> on each swing at the moment of impact. Then both swings play in sync and move together.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {playing ? <button style={btn(true)} onClick={pauseBoth}>Pause both</button> : <button style={btn(true)} onClick={aligned ? playAligned : playBoth}>{aligned ? "Play synced" : "Play both"}</button>}
        <button style={btn()} onClick={async () => { pauseBoth(); await Promise.all([seekTo(lv.current, aligned ? (impL as number) - lead : 0), seekTo(rv.current, aligned ? (impR as number) - lead : 0)]); }}>Restart</button>
        <button style={btn()} onClick={() => stepBoth(-1)} aria-label="Both back one frame">◀ 1 both</button>
        <button style={btn()} onClick={() => stepBoth(1)} aria-label="Both forward one frame">1 ▶ both</button>
        {[0.25, 0.5, 1].map((r) => <button key={r} style={btn(rate === r)} onClick={() => setRate(r)}>{r}x</button>)}
      </div>

      {voiceClip && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 10, color: "#D7DED9", fontSize: 12 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={voiceOn} onChange={(e) => { setVoiceOn(e.target.checked); if (!e.target.checked) av.current?.pause(); }} />
            Play the voice-over from the {voiceClip === right && voiceClip !== left ? "right" : "left"} video
          </label>
          <audio ref={av} src={voiceClip.voiceUrl as string} crossOrigin="anonymous" preload="auto" />
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 10, marginTop: 14 }}>
        <div style={{ color: "#FFF", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Draw on the video</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {([["none", "Off"], ["line", "Line"], ["angle", "Angle"], ["circle", "Circle"], ["pen", "Pen"]] as [Tool, string][]).map(([k, l]) => (
            <button key={k} style={btn(tool === k, true)} onClick={() => { pauseBoth(); setTool(k); }}>{l}</button>
          ))}
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label="Pick color" style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "3px solid #B8862B" : "2px solid rgba(255,255,255,0.4)", cursor: "pointer", padding: 0 }} />)}
          <button style={btn(false, true)} onClick={undo} disabled={!hasDrawing}>Undo</button>
          <button style={btn(false, true)} onClick={clearDrawing} disabled={!hasDrawing}>Clear</button>
        </div>
        {tool === "angle" && <div style={{ color: "#9FB0A6", fontSize: 12, marginTop: 6 }}>Tap three points: one end, the corner, then the other end. The angle shows at the corner.</div>}
        {tool !== "none" && tool !== "angle" && <div style={{ color: "#9FB0A6", fontSize: 12, marginTop: 6 }}>Drag on the video to draw. Pick Off to scrub again.</div>}
      </div>

      {((left.comments?.length || 0) + (right.comments?.length || 0) > 0 || onAddNote) && (
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 10, marginTop: 10 }}>
          <div style={{ color: "#FFF", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Notes pinned to a moment</div>
          {[["L", left] as const, ["R", right] as const].filter(([w]) => w === "L" || left.id !== right.id).map(([w, c]) => (c.comments || []).map((n, i) => (
            <button key={w + i} onClick={async () => { pauseBoth(); await seekTo(w === "L" ? lv.current : rv.current, n.t); }} style={{ display: "flex", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: "none", color: "#D7DED9", fontSize: 12, padding: "4px 0", cursor: "pointer" }}>
              <span style={{ color: "#4DA3FF", fontWeight: 700, flexShrink: 0 }}>{w === "L" ? "Left" : "Right"} {n.t.toFixed(1)}s</span><span>{n.text}</span>
            </button>
          )))}
          {onAddNote && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type a note, pause on the moment, then add it" style={{ flex: 1, minWidth: 160, background: "rgba(255,255,255,0.1)", color: "#FFF", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 10px", fontSize: 13 }} />
              <button style={btn(false, true)} disabled={noteBusy || !noteText.trim()} onClick={() => addNote("L")}>Add to left</button>
              <button style={btn(false, true)} disabled={noteBusy || !noteText.trim() || left.id === right.id} onClick={() => addNote("R")}>Add to right</button>
            </div>
          )}
        </div>
      )}

      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 10, marginTop: 10 }}>
        <div style={{ color: "#FFF", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Save</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!exportBusy ? (
            <button style={btn(true)} onClick={exportVideo}>Save as one video{voiceClip && voiceOn ? " (with voice-over)" : ""}</button>
          ) : (
            <button style={btn()} onClick={() => { cancelExport.current = true; }}>Cancel ({Math.round((exporting || 0) * 100)}%)</button>
          )}
          {sketchApiBase && <button style={btn()} disabled={savingSketch || exportBusy} onClick={saveToSketch}>{savingSketch ? "Saving..." : "Save frame to Swing Sketch"}</button>}
        </div>
        {exportBusy && <div style={{ color: "#FFD23F", fontSize: 12, marginTop: 6 }}>Recording the comparison in real time. Keep this screen open.</div>}
        {result && (
          <div style={{ marginTop: 10 }}>
            <video src={result.url} controls playsInline style={{ width: "100%", maxHeight: "40vh", background: "#000", borderRadius: 8 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <a href={result.url} download={`swing-compare.${result.ext}`} style={{ ...btn(true), textDecoration: "none", display: "inline-block" }}>Save to device</a>
              <button style={btn()} onClick={shareResult}>Share</button>
            </div>
          </div>
        )}
      </div>
      {msg && <div style={{ color: "#FFD23F", fontSize: 12, textAlign: "center", marginTop: 10 }}>{msg}</div>}
    </div>
  );
}
