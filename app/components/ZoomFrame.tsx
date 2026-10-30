"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Pinch / drag / button zoom for a video (and any overlay canvases layered on it).
// Everything inside is scaled together with a CSS transform, so skeletons and
// drawings stay lined up. Native video controls would zoom off-screen, so while
// zoomed they are swapped for a slim play/scrub bar underneath.
const MIN = 1;
const MAX = 6;

export default function ZoomFrame({
  children,
  getVideo,
  style,
}: {
  children: ReactNode;
  getVideo: () => HTMLVideoElement | null;
  style?: React.CSSProperties;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; cx: number; cy: number; x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const zoomed = view.s > 1.001;

  function clamp(s: number, x: number, y: number) {
    const el = box.current;
    const w = el?.clientWidth || 0;
    const h = el?.clientHeight || 0;
    const ns = Math.max(MIN, Math.min(MAX, s));
    return { s: ns, x: Math.min(0, Math.max(w - w * ns, x)), y: Math.min(0, Math.max(h - h * ns, y)) };
  }

  // zoom by a factor around a point (container coordinates)
  function zoomAt(factor: number, px: number, py: number) {
    const v = viewRef.current;
    const ns = Math.max(MIN, Math.min(MAX, v.s * factor));
    const k = ns / v.s;
    setView(clamp(ns, px - (px - v.x) * k, py - (py - v.y) * k));
  }
  function zoomCenter(factor: number) {
    const el = box.current;
    if (!el) return;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  }

  // Native controls off while zoomed.
  useEffect(() => {
    const v = getVideo();
    if (v) v.controls = !zoomed;
    return () => { const vv = getVideo(); if (vv) vv.controls = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed]);

  // Keep the slim bar in sync while zoomed.
  useEffect(() => {
    if (!zoomed) return;
    const id = window.setInterval(() => {
      const v = getVideo();
      if (!v) return;
      setPlaying(!v.paused && !v.ended);
      setTime({ cur: v.currentTime || 0, dur: v.duration || 0 });
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed]);

  function pos(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-zoom-ui]")) return;
    pointers.current.set(e.pointerId, pos(e));
    const pts: { x: number; y: number }[] = Array.from(pointers.current.values());
    const v = viewRef.current;
    if (pts.length === 2) {
      gesture.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        s: v.s, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, x: v.x, y: v.y,
      };
      try { box.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    } else if (pts.length === 1 && v.s > 1.001) {
      gesture.current = { dist: 0, s: v.s, cx: pts[0].x, cy: pts[0].y, x: v.x, y: v.y };
      try { box.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, pos(e));
    const g = gesture.current;
    if (!g) return;
    const pts: { x: number; y: number }[] = Array.from(pointers.current.values());
    if (pts.length >= 2 && g.dist > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const ns = Math.max(MIN, Math.min(MAX, g.s * (d / g.dist)));
      const k = ns / g.s;
      // keep the content under the starting midpoint under the current midpoint
      setView(clamp(ns, mx - (g.cx - g.x) * k, my - (g.cy - g.y) * k));
    } else if (pts.length === 1 && g.dist === 0) {
      setView(clamp(g.s, g.x + (pts[0].x - g.cx), g.y + (pts[0].y - g.cy)));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    const pts: { x: number; y: number }[] = Array.from(pointers.current.values());
    if (pts.length === 1 && viewRef.current.s > 1.001) {
      const v = viewRef.current;
      gesture.current = { dist: 0, s: v.s, cx: pts[0].x, cy: pts[0].y, x: v.x, y: v.y };
    }
  }
  function onWheel(e: React.WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return; // plain scrolling still scrolls the page
    e.preventDefault();
    const r = box.current!.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }

  const btn: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(0,0,0,0.55)", color: "#FFF", fontSize: 18, fontWeight: 700, lineHeight: 1, cursor: "pointer",
  };
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

  return (
    <div style={style}>
      <div
        ref={box}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{ position: "relative", overflow: "hidden", borderRadius: 8, touchAction: zoomed ? "none" : "pan-y" }}
      >
        <div style={{ transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
          {children}
        </div>
        <div data-zoom-ui style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 5 }}>
          {zoomed && (
            <button type="button" style={{ ...btn, width: "auto", padding: "0 10px", fontSize: 12 }} onClick={() => setView({ s: 1, x: 0, y: 0 })}>
              Reset
            </button>
          )}
          <button type="button" aria-label="Zoom out" style={{ ...btn, opacity: zoomed ? 1 : 0.5 }} onClick={() => zoomCenter(1 / 1.5)}>&minus;</button>
          <button type="button" aria-label="Zoom in" style={btn} onClick={() => zoomCenter(1.5)}>+</button>
        </div>
      </div>
      {zoomed && (
        <div data-zoom-ui style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button
            type="button"
            style={{ ...btn, background: "rgba(0,0,0,0.75)", width: 40 }}
            onClick={() => { const v = getVideo(); if (!v) return; if (v.paused) void v.play(); else v.pause(); }}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={time.dur || 0}
            step={0.01}
            value={Math.min(time.cur, time.dur || 0)}
            onChange={(e) => { const v = getVideo(); if (v) { v.currentTime = Number(e.target.value); setTime((t) => ({ ...t, cur: Number(e.target.value) })); } }}
            style={{ flex: 1 }}
          />
          <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>{fmt(time.cur)} / {fmt(time.dur)}</span>
        </div>
      )}
    </div>
  );
}
