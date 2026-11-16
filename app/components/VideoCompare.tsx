"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

export type CompareClip = { id: string; url: string; label: string };

const FRAME = 1 / 30;

// Two swings next to each other with shared controls. Scrub each side to the
// same moment (usually impact or the top of the backswing), then play both.
export default function VideoCompare({ clips, initialId, onClose }: { clips: CompareClip[]; initialId: string; onClose: () => void }) {
  const [leftId, setLeftId] = useState(initialId);
  const [rightId, setRightId] = useState(() => clips.find((c) => c.id !== initialId)?.id || initialId);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => { setNative(Capacitor.isNativePlatform()); }, []);

  const lv = useRef<HTMLVideoElement | null>(null);
  const rv = useRef<HTMLVideoElement | null>(null);
  const [lt, setLt] = useState(0);
  const [rt, setRt] = useState(0);
  const [ld, setLd] = useState(0);
  const [rd, setRd] = useState(0);

  const left = clips.find((c) => c.id === leftId) || clips[0];
  const right = clips.find((c) => c.id === rightId) || clips[0];

  useEffect(() => { if (lv.current) lv.current.playbackRate = rate; if (rv.current) rv.current.playbackRate = rate; }, [rate, leftId, rightId]);

  function playBoth() {
    lv.current?.play().catch(() => {});
    rv.current?.play().catch(() => {});
    setPlaying(true);
  }
  function pauseBoth() {
    lv.current?.pause();
    rv.current?.pause();
    setPlaying(false);
  }
  function step(v: HTMLVideoElement | null, dir: number) {
    if (!v) return;
    v.pause();
    setPlaying(false);
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + dir * FRAME));
  }
  function seek(v: HTMLVideoElement | null, t: number) {
    if (!v) return;
    v.currentTime = t;
  }

  const btn = (active = false): React.CSSProperties => ({
    background: active ? "#B8862B" : "rgba(255,255,255,0.12)", color: "#FFF", border: "none", borderRadius: 8,
    padding: "9px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", minWidth: 40,
  });

  const side = (
    which: "left" | "right",
    clip: CompareClip,
    ref: React.MutableRefObject<HTMLVideoElement | null>,
    t: number,
    d: number,
    setT: (n: number) => void,
    setD: (n: number) => void,
    setId: (id: string) => void
  ) => (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <select
        value={clip.id}
        onChange={(e) => { setId(e.target.value); setPlaying(false); }}
        style={{ width: "100%", background: "rgba(255,255,255,0.1)", color: "#FFF", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 6px", fontSize: 12 }}
      >
        {clips.map((c) => <option key={c.id} value={c.id} style={{ color: "#000" }}>{c.label}</option>)}
      </select>
      <video
        key={clip.id + which}
        ref={ref}
        src={clip.url}
        playsInline
        muted
        preload="auto"
        onLoadedMetadata={(e) => { setD(e.currentTarget.duration || 0); setT(0); e.currentTarget.playbackRate = rate; }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        style={{ width: "100%", maxHeight: "48vh", background: "#000", borderRadius: 8, objectFit: "contain" }}
      />
      <input
        type="range" min={0} max={d || 1} step={0.01} value={Math.min(t, d || 1)}
        onChange={(e) => { pauseBoth(); seek(ref.current, parseFloat(e.target.value)); setT(parseFloat(e.target.value)); }}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
        <button style={btn()} onClick={() => step(ref.current, -1)} aria-label="Back one frame">◀ 1</button>
        <span style={{ color: "#D7DED9", fontSize: 12, minWidth: 44, textAlign: "center" }}>{t.toFixed(2)}s</span>
        <button style={btn()} onClick={() => step(ref.current, 1)} aria-label="Forward one frame">1 ▶</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10002, background: "#0F1A15", overflowY: "auto", fontFamily: "sans-serif", padding: `14px 12px ${native ? 130 : 24}px` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: "#FFF", fontSize: 17, fontWeight: 700 }}>Compare swings</div>
        <button style={btn()} onClick={() => { pauseBoth(); onClose(); }}>Close</button>
      </div>
      {clips.length < 2 && <div style={{ color: "#D7DED9", fontSize: 13, marginBottom: 10 }}>You need at least two videos to compare. Upload another and it will show up here.</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {side("left", left, lv, lt, ld, setLt, setLd, setLeftId)}
        {side("right", right, rv, rt, rd, setRt, setRd, setRightId)}
      </div>
      <div style={{ color: "#9FB0A6", fontSize: 12, textAlign: "center", margin: "12px 0 8px" }}>
        Move each slider to the same moment (like impact), then tap Play both.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {playing ? <button style={btn(true)} onClick={pauseBoth}>Pause both</button> : <button style={btn(true)} onClick={playBoth}>Play both</button>}
        <button style={btn()} onClick={() => { pauseBoth(); seek(lv.current, 0); seek(rv.current, 0); }}>Restart</button>
        {[0.25, 0.5, 1].map((r) => <button key={r} style={btn(rate === r)} onClick={() => setRate(r)}>{r}x</button>)}
      </div>
    </div>
  );
}
