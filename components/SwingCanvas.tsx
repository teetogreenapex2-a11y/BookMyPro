"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---- Drawing math -----------------------------------------------------

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleAt(v: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const a = { x: p1.x - v.x, y: p1.y - v.y };
  const b = { x: p2.x - v.x, y: p2.y - v.y };
  const dot = a.x * b.x + a.y * b.y;
  const magA = Math.hypot(a.x, a.y) || 1;
  const magB = Math.hypot(b.x, b.y) || 1;
  const cos = Math.min(1, Math.max(-1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number, color: string) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 7), to.y - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 7), to.y - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ---- Tools & palette (matching the app's actual brand colors) --------

const COLORS = [
  { name: "Chalk", hex: "#F6F4EE" },
  { name: "Gold", hex: "#B8862B" },
  { name: "Fairway", hex: "#1B3A2F" },
  { name: "Flag Red", hex: "#B23A3A" },
  { name: "Sky", hex: "#3B6FA0" },
];

const TOOLS = [
  { id: "pen", label: "Pen" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "circle", label: "Circle" },
  { id: "angle", label: "Angle" },
  { id: "text", label: "Label" },
  { id: "erase", label: "Erase" },
] as const;

type Tool = typeof TOOLS[number]["id"];
type Point = { x: number; y: number };
type Shape =
  | { type: "pen" | "erase"; color: string; width: number; points: Point[] }
  | { type: "line" | "arrow"; color: string; width: number; from: Point; to: Point }
  | { type: "circle"; color: string; width: number; center: Point; radius: number }
  | { type: "angle"; color: string; width: number; vertex: Point; p1: Point; p2: Point; degrees: number }
  | { type: "text"; color: string; width: number; point: Point; text: string };

export type SwingCanvasHandle = {
  exportPng: () => Promise<Blob>;
  getShapesJson: () => string;
};

export default function SwingCanvas({
  initialSourceUrl,
  initialShapesJson,
  onReady,
}: {
  initialSourceUrl?: string | null;
  initialShapesJson?: string | null;
  onReady?: (handle: SwingCanvasHandle) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [tool, setTool] = useState<Tool>("line");
  const [color, setColor] = useState(COLORS[1].hex);
  const [lineWidth, setLineWidth] = useState(4);
  const [shapes, setShapes] = useState<Shape[]>(() => {
    if (initialShapesJson) {
      try {
        return JSON.parse(initialShapesJson);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [current, setCurrent] = useState<Shape | null>(null);
  const [angleClicks, setAngleClicks] = useState<Point[]>([]);
  const [hasImage, setHasImage] = useState(false);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null); // set while scrubbing a video, before a frame is captured
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [textPrompt, setTextPrompt] = useState<Point | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const drawingRef = useRef(false);

  // Load an existing source photo (re-editing a saved sketch) if provided.
  useEffect(() => {
    if (!initialSourceUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      redraw();
    };
    img.src = initialSourceUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSourceUrl]);

  function getPos(clientX: number, clientY: number): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * dims.w,
      y: ((clientY - rect.top) / rect.height) * dims.h,
    };
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, dims.w, dims.h);

    if (imgRef.current) {
      ctx.drawImage(imgRef.current, 0, 0, dims.w, dims.h);
    } else {
      // Plain turf-green background with a faint grid when there's no photo to mark up.
      ctx.fillStyle = "#1B3A2F";
      ctx.fillRect(0, 0, dims.w, dims.h);
      ctx.strokeStyle = "rgba(246,244,238,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < dims.w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dims.h);
        ctx.stroke();
      }
      for (let y = 0; y < dims.h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dims.w, y);
        ctx.stroke();
      }
    }

    const drawShape = (s: Shape) => {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;

      if (s.type === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.lineWidth = s.width * 3;
        ctx.stroke();
      } else if (s.type === "pen") {
        ctx.beginPath();
        s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
      } else if (s.type === "line") {
        ctx.beginPath();
        ctx.moveTo(s.from.x, s.from.y);
        ctx.lineTo(s.to.x, s.to.y);
        ctx.stroke();
      } else if (s.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(s.from.x, s.from.y);
        ctx.lineTo(s.to.x, s.to.y);
        ctx.stroke();
        drawArrowHead(ctx, s.from, s.to, 14 + s.width, s.color);
      } else if (s.type === "circle") {
        ctx.beginPath();
        ctx.arc(s.center.x, s.center.y, s.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === "angle") {
        ctx.beginPath();
        ctx.moveTo(s.p1.x, s.p1.y);
        ctx.lineTo(s.vertex.x, s.vertex.y);
        ctx.lineTo(s.p2.x, s.p2.y);
        ctx.stroke();
        ctx.font = "bold 20px sans-serif";
        ctx.fillText(`${Math.round(s.degrees)}°`, s.vertex.x + 10, s.vertex.y - 10);
      } else if (s.type === "text") {
        ctx.font = "bold 22px sans-serif";
        ctx.fillText(s.text, s.point.x, s.point.y);
      }
      ctx.restore();
    };

    shapes.forEach(drawShape);
    if (current) drawShape(current);
    if (angleClicks.length > 0) {
      ctx.save();
      ctx.fillStyle = color;
      angleClicks.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }, [dims, shapes, current, angleClicks, color]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // --- Pointer/touch handling ---------------------------------------
  // React's synthetic touch handlers are passive by default in modern
  // browsers, which means calling preventDefault() inside them does NOT
  // actually stop the page from scrolling while drawing. The fix is to
  // attach a real, non-passive listener directly to the canvas DOM node
  // once on mount, rather than relying on JSX onTouchStart/onTouchMove.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleStart(clientX: number, clientY: number) {
      const p = getPos(clientX, clientY);
      drawingRef.current = true;
      if (tool === "angle") {
        setAngleClicks((prev) => {
          const next = [...prev, p];
          if (next.length === 3) {
            const [vertex, p1, p2] = next;
            const degrees = angleAt(vertex, p1, p2);
            setShapes((s) => [...s, { type: "angle", color, width: lineWidth, vertex, p1, p2, degrees }]);
            return [];
          }
          return next;
        });
        return;
      }
      if (tool === "text") {
        setTextPrompt(p);
        return;
      }
      if (tool === "pen" || tool === "erase") {
        setCurrent({ type: tool, color, width: lineWidth, points: [p] });
      } else if (tool === "line") {
        setCurrent({ type: "line", color, width: lineWidth, from: p, to: p });
      } else if (tool === "arrow") {
        setCurrent({ type: "arrow", color, width: lineWidth, from: p, to: p });
      } else if (tool === "circle") {
        setCurrent({ type: "circle", color, width: lineWidth, center: p, radius: 0 });
      }
    }

    function handleMove(clientX: number, clientY: number) {
      if (!drawingRef.current) return;
      const p = getPos(clientX, clientY);
      setCurrent((prev) => {
        if (!prev) return prev;
        if (prev.type === "pen" || prev.type === "erase") return { ...prev, points: [...prev.points, p] };
        if (prev.type === "line" || prev.type === "arrow") return { ...prev, to: p };
        if (prev.type === "circle") return { ...prev, radius: dist(prev.center, p) };
        return prev;
      });
    }

    function handleEnd() {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      setCurrent((prev) => {
        if (prev) setShapes((s) => [...s, prev]);
        return null;
      });
    }

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      handleStart(t.clientX, t.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
    }
    function onTouchEnd(e: TouchEvent) {
      e.preventDefault();
      handleEnd();
    }
    function onMouseDown(e: MouseEvent) {
      handleStart(e.clientX, e.clientY);
    }
    function onMouseMove(e: MouseEvent) {
      handleMove(e.clientX, e.clientY);
    }
    function onMouseUp() {
      handleEnd();
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, lineWidth, dims]);

  function confirmText() {
    if (textPrompt && textDraft.trim()) {
      setShapes((s) => [...s, { type: "text", color, width: lineWidth, point: textPrompt, text: textDraft.trim() }]);
    }
    setTextPrompt(null);
    setTextDraft("");
  }

  function undo() {
    setShapes((s) => s.slice(0, -1));
  }
  function clearAll() {
    setShapes([]);
  }

  function loadPhoto(file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      redraw();
    };
    img.src = url;
  }

  function loadMedia(file: File) {
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      setPendingVideoUrl(url);
    } else {
      loadPhoto(file);
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    // Draw the current frame once, then freeze it as a static image —
    // otherwise pointing the canvas at a live <video> would keep showing
    // whatever frame is currently playing instead of the one you picked.
    const off = document.createElement("canvas");
    off.width = dims.w;
    off.height = dims.h;
    const offCtx = off.getContext("2d")!;
    offCtx.drawImage(video, 0, 0, dims.w, dims.h);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      setPendingVideoUrl(null);
      redraw();
    };
    img.src = off.toDataURL("image/png");
  }

  async function exportPng(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error("Canvas not ready"));
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), "image/png");
    });
  }

  function getShapesJson() {
    return JSON.stringify(shapes);
  }

  useEffect(() => {
    onReady?.({ exportPng, getShapesJson });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes]);

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTool(t.id); setAngleClicks([]); }}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: tool === t.id ? "1px solid var(--fairway)" : "1px solid var(--border)",
              background: tool === t.id ? "var(--open)" : "#FFF",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {COLORS.map((c) => (
            <button
              key={c.hex}
              onClick={() => setColor(c.hex)}
              aria-label={c.name}
              style={{
                width: 24, height: 24, borderRadius: "50%", background: c.hex,
                border: color === c.hex ? "2px solid var(--gold)" : "1px solid var(--border)",
              }}
            />
          ))}
        </div>
        <input
          type="range" min={2} max={12} value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          style={{ width: 100 }}
        />
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fairway)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
          {hasImage ? "Change photo/video" : "Add photo or video"}
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadMedia(f); }}
            style={{ display: "none" }}
          />
        </label>
        <button onClick={undo} style={{ fontSize: 12, fontWeight: 700, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
          Undo
        </button>
        <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 700, color: "#B23A3A", background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
          Clear
        </button>
      </div>

      {pendingVideoUrl && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 8px" }}>
            Scrub to the moment you want, then capture it as a still frame to draw on.
          </p>
          <video ref={videoRef} src={pendingVideoUrl} controls style={{ width: "100%", borderRadius: 8, marginBottom: 8, background: "#000" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setPendingVideoUrl(null)}
              style={{ flex: 1, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              onClick={captureFrame}
              style={{ flex: 1, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700 }}
            >
              Use this frame
            </button>
          </div>
        </div>
      )}

      {tool === "angle" && angleClicks.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>
          {angleClicks.length === 1 ? "Now tap the first end point." : "Now tap the second end point."}
        </p>
      )}

      <canvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        style={{ width: "100%", aspectRatio: `${dims.w} / ${dims.h}`, borderRadius: 10, border: "1px solid var(--border)", touchAction: "none", cursor: "crosshair" }}
      />

      {textPrompt && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            autoFocus
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmText()}
            placeholder="Label text"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
          />
          <button onClick={confirmText} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
