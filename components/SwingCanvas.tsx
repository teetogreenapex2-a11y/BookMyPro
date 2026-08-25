"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

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

// Shortest distance from a point to a line segment - used to hit-test
// lines, arrows, and pen strokes, since a click is almost never exactly
// on the mathematical line itself.
function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
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
  { id: "move", label: "Move" },
  { id: "pen", label: "Pen" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "circle", label: "Circle" },
  { id: "angle", label: "Angle" },
  { id: "text", label: "Label" },
  { id: "trace", label: "Clubhead trace" },
  { id: "erase", label: "Erase" },
] as const;

type Tool = typeof TOOLS[number]["id"];
type Point = { x: number; y: number };
type Shape =
  | { type: "pen" | "erase"; color: string; width: number; points: Point[] }
  | { type: "line" | "arrow"; color: string; width: number; from: Point; to: Point }
  | { type: "circle"; color: string; width: number; center: Point; radius: number }
  | { type: "angle"; color: string; width: number; vertex: Point; p1: Point; p2: Point; degrees: number }
  | { type: "text"; color: string; width: number; point: Point; text: string }
  // A handful of deliberately-placed points, one per key moment in the
  // swing (address, top, impact, etc.), each tapped on its own captured
  // video frame rather than dragged in one freehand motion like "pen" -
  // rendered as a smooth curve through them, not a raw point-to-point path.
  | { type: "trace"; color: string; width: number; points: Point[] }
  // AI-detected body landmarks on one still frame - 33 points from
  // MediaPipe's pose model, rendered as a skeleton (connecting lines
  // between shoulders/elbows/wrists/hips/knees/ankles) plus small dots at
  // each joint. Distinct from "trace" above: this is a full-body snapshot
  // detected automatically, not a hand-placed path across several frames.
  // lowConfidenceIndices marks which compact-array positions MediaPipe
  // itself wasn't confident about, so those get drawn lighter/dashed
  // instead of presented as solid fact - optional since a pose shape
  // saved before this field existed won't have it.
  | { type: "pose"; color: string; width: number; points: Point[]; lowConfidenceIndices?: number[] };

// How close a click needs to be to a shape's actual line/edge to count as
// hitting it, in canvas pixels - generous enough to comfortably tap a
// thin line on a phone screen without needing pixel-perfect precision.
const HIT_TOLERANCE = 16;

// MediaPipe's pose model returns 33 landmarks in a fixed order, but only
// these 12 (shoulders/elbows/wrists/hips/knees/ankles) matter for a golf
// swing - face and hand detail landmarks exist in the raw data but aren't
// useful here. POSE_LANDMARK_INDICES is the map from "compact" position
// (what's actually stored and drawn) back to MediaPipe's own original
// index, used once at detection time; POSE_CONNECTIONS below already
// refers to the compact positions, not MediaPipe's raw indices.
const POSE_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
// Compact positions: 0/1 shoulders, 2/3 elbows, 4/5 wrists, 6/7 hips, 8/9 knees, 10/11 ankles (L/R each).
const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], // shoulder to shoulder
  [0, 2], [2, 4], // left arm
  [1, 3], [3, 5], // right arm
  [0, 6], [1, 7], // shoulder to hip (torso sides)
  [6, 7], // hip to hip
  [6, 8], [8, 10], // left leg
  [7, 9], [9, 11], // right leg
];

function hitTestShape(shape: Shape, p: Point): boolean {
  switch (shape.type) {
    case "pen":
    case "erase":
    case "trace":
    case "pose":
      return shape.points.some((pt) => dist(pt, p) < HIT_TOLERANCE);
    case "line":
    case "arrow":
      return distToSegment(p, shape.from, shape.to) < HIT_TOLERANCE;
    case "circle":
      return Math.abs(dist(shape.center, p) - shape.radius) < HIT_TOLERANCE;
    case "angle":
      return (
        distToSegment(p, shape.vertex, shape.p1) < HIT_TOLERANCE ||
        distToSegment(p, shape.vertex, shape.p2) < HIT_TOLERANCE
      );
    case "text":
      // Text has no stored width, so this uses a fixed-size box around
      // its anchor point - generous enough for most short labels.
      return Math.abs(shape.point.x - p.x) < 60 && Math.abs(shape.point.y - p.y) < 20;
  }
}

// Shifts every coordinate in a shape by (dx, dy) - used while dragging
// with the Move tool. Returns a new shape rather than mutating, matching
// how the rest of this component treats shapes as immutable.
function translateShape(shape: Shape, dx: number, dy: number): Shape {
  switch (shape.type) {
    case "pen":
    case "erase":
    case "trace":
    case "pose":
      return { ...shape, points: shape.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
    case "line":
    case "arrow":
      return { ...shape, from: { x: shape.from.x + dx, y: shape.from.y + dy }, to: { x: shape.to.x + dx, y: shape.to.y + dy } };
    case "circle":
      return { ...shape, center: { x: shape.center.x + dx, y: shape.center.y + dy } };
    case "angle":
      return {
        ...shape,
        vertex: { x: shape.vertex.x + dx, y: shape.vertex.y + dy },
        p1: { x: shape.p1.x + dx, y: shape.p1.y + dy },
        p2: { x: shape.p2.x + dx, y: shape.p2.y + dy },
      };
    case "text":
      return { ...shape, point: { x: shape.point.x + dx, y: shape.point.y + dy } };
  }
}

export type SwingCanvasHandle = {
  exportPng: () => Promise<Blob>;
  getShapesJson: () => string;
};

// Cached across every SwingCanvas instance for the lifetime of the app -
// loading the WASM runtime and model file takes real time, so this makes
// every detection after the very first one fast. Lazily created the first
// time it's actually needed, not on component mount.
let cachedPoseLandmarkerPromise: Promise<any> | null = null;
async function getPoseLandmarker() {
  if (!cachedPoseLandmarkerPromise) {
    cachedPoseLandmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
        },
        runningMode: "IMAGE",
      });
    })();
  }
  return cachedPoseLandmarkerPromise;
}

export default function SwingCanvas({
  initialSourceUrl,
  initialShapesJson,
  onReady,
  aiAnalysisEnabled,
}: {
  initialSourceUrl?: string | null;
  initialShapesJson?: string | null;
  onReady?: (handle: SwingCanvasHandle) => void;
  // Per-instructor, per-student opt-in (see the AiAnalysisPreference model)
  // - only shows the "Detect body pose" action when the specific
  // instructor working on this sketch has turned it on for this specific
  // player, not a blanket feature flag.
  aiAnalysisEnabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Fits a photo's real aspect ratio into a reasonable max size, instead
  // of forcing every photo into one fixed 900x600 box regardless of its
  // actual shape - that's what was causing camera photos (usually taller
  // than they are wide) to look visibly squashed.
  function dimsForImage(width: number, height: number, maxSize = 900) {
    if (width <= 0 || height <= 0) return { w: 900, h: 600 };
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    return { w: Math.round(width * scale), h: Math.round(height * scale) };
  }

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
  const [detectingPose, setDetectingPose] = useState(false);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null); // set while scrubbing a video, before a frame is captured
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const traceImgRef = useRef<HTMLImageElement | null>(null);
  // Clubhead trace: points accumulate across several separately-captured
  // frames (one tap per key swing position), rather than one continuous
  // drag like the pen tool. tracePendingFrameUrl is non-null only in the
  // brief "tap to place this one point" step between marking a frame and
  // going back to the video scrubber. traceBackgroundImageUrl is fixed to
  // whichever frame was captured first, and becomes the final background
  // image once the trace is finished - address position is usually the
  // clearest, most static reference frame for this.
  const [tracePoints, setTracePoints] = useState<Point[]>([]);
  const [tracePendingFrameUrl, setTracePendingFrameUrl] = useState<string | null>(null);
  const [traceBackgroundImageUrl, setTraceBackgroundImageUrl] = useState<string | null>(null);
  const [textPrompt, setTextPrompt] = useState<Point | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const drawingRef = useRef(false);
  const movingRef = useRef<{ index: number; lastPoint: Point } | null>(null);

  // Load an existing source photo (re-editing a saved sketch) if provided.
  useEffect(() => {
    if (!initialSourceUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setDims(dimsForImage(img.naturalWidth, img.naturalHeight));
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
      } else if (s.type === "trace") {
        if (s.points.length >= 2) {
          // Quadratic curves through consecutive midpoints - a standard
          // way to get a smooth-looking path through a handful of
          // discrete points, rather than the sharp corners a straight
          // point-to-point line would have.
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length - 1; i++) {
            const mid = { x: (s.points[i].x + s.points[i + 1].x) / 2, y: (s.points[i].y + s.points[i + 1].y) / 2 };
            ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mid.x, mid.y);
          }
          ctx.lineTo(s.points[s.points.length - 1].x, s.points[s.points.length - 1].y);
          ctx.stroke();
          const last = s.points[s.points.length - 1];
          const secondLast = s.points[s.points.length - 2];
          drawArrowHead(ctx, secondLast, last, 14 + s.width, s.color);
        }
        // A small dot at each marked position, so the discrete key
        // moments (address, top, impact...) stay visible under the
        // smoothed curve connecting them.
        s.points.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(3, s.width / 2), 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (s.type === "pose") {
        const lowConf = new Set(s.lowConfidenceIndices || []);
        POSE_CONNECTIONS.forEach(([a, b]) => {
          const pa = s.points[a], pb = s.points[b];
          if (!pa || !pb) return; // a landmark can be missing if it wasn't visible/confident enough
          const uncertain = lowConf.has(a) || lowConf.has(b);
          ctx.save();
          if (uncertain) {
            ctx.setLineDash([5, 4]);
            ctx.globalAlpha = 0.45;
          }
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
          ctx.restore();
        });
        s.points.forEach((p, i) => {
          ctx.save();
          if (lowConf.has(i)) ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(3, s.width / 2), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
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
      if (tool === "move") {
        // Check shapes topmost-first, since later shapes are drawn over
        // earlier ones and should take priority when they overlap.
        setShapes((currentShapes) => {
          for (let i = currentShapes.length - 1; i >= 0; i--) {
            if (hitTestShape(currentShapes[i], p)) {
              movingRef.current = { index: i, lastPoint: p };
              break;
            }
          }
          return currentShapes;
        });
        return;
      }
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
      const p = getPos(clientX, clientY);
      if (movingRef.current) {
        const { index, lastPoint } = movingRef.current;
        const dx = p.x - lastPoint.x;
        const dy = p.y - lastPoint.y;
        setShapes((s) => s.map((shape, i) => (i === index ? translateShape(shape, dx, dy) : shape)));
        movingRef.current = { index, lastPoint: p };
        return;
      }
      if (!drawingRef.current) return;
      setCurrent((prev) => {
        if (!prev) return prev;
        if (prev.type === "pen" || prev.type === "erase") return { ...prev, points: [...prev.points, p] };
        if (prev.type === "line" || prev.type === "arrow") return { ...prev, to: p };
        if (prev.type === "circle") return { ...prev, radius: dist(prev.center, p) };
        return prev;
      });
    }

    function handleEnd() {
      if (movingRef.current) {
        movingRef.current = null;
        return;
      }
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
      setDims(dimsForImage(img.naturalWidth, img.naturalHeight));
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

  // Same underlying capture technique as captureFrame above, but for one
  // point in an in-progress clubhead trace: freezes the current moment as
  // a still image to tap a point on, instead of replacing the whole
  // canvas with it.
  function markFrameForTrace() {
    const video = videoRef.current;
    if (!video) return;
    const off = document.createElement("canvas");
    off.width = dims.w;
    off.height = dims.h;
    const offCtx = off.getContext("2d")!;
    offCtx.drawImage(video, 0, 0, dims.w, dims.h);
    const dataUrl = off.toDataURL("image/png");
    setTracePendingFrameUrl(dataUrl);
    // Only the very first marked frame becomes the eventual background -
    // later marks just add points, they don't change which image the
    // trace ends up drawn on top of.
    setTraceBackgroundImageUrl((prev) => prev ?? dataUrl);
  }

  function placeTracePoint(e: ReactMouseEvent<HTMLImageElement>) {
    const img = traceImgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const p = { x: ((e.clientX - rect.left) / rect.width) * dims.w, y: ((e.clientY - rect.top) / rect.height) * dims.h };
    setTracePoints((prev) => [...prev, p]);
    setTracePendingFrameUrl(null); // back to the video scrubber for the next point
  }

  function undoTracePoint() {
    setTracePoints((prev) => prev.slice(0, -1));
  }

  function cancelTrace() {
    setTracePoints([]);
    setTracePendingFrameUrl(null);
    setTraceBackgroundImageUrl(null);
    setPendingVideoUrl(null);
  }

  function finishTrace() {
    if (tracePoints.length < 2 || !traceBackgroundImageUrl) return;
    setShapes((s) => [...s, { type: "trace", color, width: lineWidth, points: tracePoints }]);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      redraw();
    };
    img.src = traceBackgroundImageUrl;
    setTracePoints([]);
    setTracePendingFrameUrl(null);
    setTraceBackgroundImageUrl(null);
    setPendingVideoUrl(null);
    setTool("move");
  }

  async function detectPose() {
    const img = imgRef.current;
    if (!img) return;
    setDetectingPose(true);
    try {
      const landmarker = await getPoseLandmarker();
      const result = landmarker.detect(img);
      const rawLandmarks = result?.landmarks?.[0]; // first (and only) detected person
      if (!rawLandmarks) {
        alert("Couldn't detect a person in this frame clearly enough. Try a frame where the golfer is fully in view.");
        return;
      }
      // Landmarks come back normalized (0-1 relative to the image), not
      // in the pixel coordinates every other shape on this canvas uses -
      // scale by the same dims.w/h the image itself was captured at.
      const points: Point[] = POSE_LANDMARK_INDICES.map((i) => ({
        x: rawLandmarks[i].x * dims.w,
        y: rawLandmarks[i].y * dims.h,
      }));
      // MediaPipe scores how sure it is about each individual landmark
      // (0-1) - below ~0.5 is genuinely more guess than detection, so
      // those get flagged rather than drawn as confidently as everything
      // else. A confidence-flagged skeleton is a lot more useful than one
      // that looks equally certain everywhere when it isn't.
      const CONFIDENCE_THRESHOLD = 0.5;
      const lowConfidenceIndices = POSE_LANDMARK_INDICES
        .map((i, compactIndex) => ({ compactIndex, visibility: rawLandmarks[i].visibility ?? 1 }))
        .filter((l) => l.visibility < CONFIDENCE_THRESHOLD)
        .map((l) => l.compactIndex);

      if (lowConfidenceIndices.length > POSE_LANDMARK_INDICES.length / 2) {
        const proceed = confirm(
          "This frame is hard to read clearly - more than half the body isn't confidently detected, likely from the angle, lighting, or part of the golfer being out of frame. The result will show as mostly unreliable. Add it anyway?"
        );
        if (!proceed) return;
      }

      setShapes((s) => [...s, { type: "pose", color, width: lineWidth, points, lowConfidenceIndices }]);
    } catch (err) {
      console.error("Pose detection failed:", err);
      alert("Something went wrong detecting the pose. Try again.");
    } finally {
      setDetectingPose(false);
    }
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

      {pendingVideoUrl && tool === "trace" && !tracePendingFrameUrl && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 8px" }}>
            Scrub to a key moment (address, top, impact...), then mark the clubhead there. Repeat for each position, then finish.
          </p>
          <video ref={videoRef} src={pendingVideoUrl} controls style={{ width: "100%", borderRadius: 8, marginBottom: 8, background: "#000" }} />
          <div style={{ display: "flex", gap: 8, marginBottom: tracePoints.length > 0 ? 8 : 0 }}>
            <button
              onClick={cancelTrace}
              style={{ flex: 1, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              onClick={markFrameForTrace}
              style={{ flex: 2, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700 }}
            >
              📍 Mark clubhead at this frame
            </button>
          </div>
          {tracePoints.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--faint)", flex: 1 }}>
                {tracePoints.length} {tracePoints.length === 1 ? "point" : "points"} marked
              </span>
              <button onClick={undoTracePoint} style={{ fontSize: 12, fontWeight: 700, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px" }}>
                Undo last
              </button>
              <button
                onClick={finishTrace}
                disabled={tracePoints.length < 2}
                style={{
                  fontSize: 12, fontWeight: 700, background: "var(--gold)", color: "var(--fairway)", border: "none",
                  borderRadius: 8, padding: "6px 12px", opacity: tracePoints.length < 2 ? 0.5 : 1,
                }}
              >
                Finish trace
              </button>
            </div>
          )}
        </div>
      )}

      {tracePendingFrameUrl && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
          <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 8px" }}>
            Tap the clubhead's position in this frame.
          </p>
          <img
            ref={traceImgRef}
            src={tracePendingFrameUrl}
            onClick={placeTracePoint}
            style={{ width: "100%", borderRadius: 8, cursor: "crosshair", touchAction: "none" }}
          />
        </div>
      )}

      {pendingVideoUrl && tool !== "trace" && (
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

      {tool === "trace" && !pendingVideoUrl && !tracePendingFrameUrl && (
        <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>
          Add a video above to trace the clubhead across the swing.
        </p>
      )}

      {aiAnalysisEnabled && hasImage && !pendingVideoUrl && !tracePendingFrameUrl && (
        <button
          onClick={detectPose}
          disabled={detectingPose}
          style={{
            alignSelf: "flex-start", background: "var(--fairway)", color: "var(--chalk)", border: "none",
            borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700,
            opacity: detectingPose ? 0.7 : 1,
          }}
        >
          {detectingPose ? "Detecting…" : "🤖 Detect body pose"}
        </button>
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
