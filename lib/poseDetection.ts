// Shared by every place in the app that does AI pose detection: Swing
// Sketch (one-off, on a captured frame), Instant Replay (one-off, on a
// paused recorded clip), and the live remote-lesson video call
// (continuous, on the live stream). Keeping this in one place means all
// three draw and score the exact same way, rather than three
// independently-drifting implementations.

export type Point = { x: number; y: number };

// MediaPipe's pose model returns 33 landmarks in a fixed order, but only
// these 12 (shoulders/elbows/wrists/hips/knees/ankles) matter for a golf
// swing - face and hand detail landmarks exist in the raw data but aren't
// useful here. POSE_LANDMARK_INDICES is the map from "compact" position
// (what's actually stored and drawn) back to MediaPipe's own original
// index; POSE_CONNECTIONS below already refers to the compact positions,
// not MediaPipe's raw indices.
export const POSE_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
// Compact positions: 0/1 shoulders, 2/3 elbows, 4/5 wrists, 6/7 hips, 8/9 knees, 10/11 ankles (L/R each).
export const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], // shoulder to shoulder
  [0, 2], [2, 4], // left arm
  [1, 3], [3, 5], // right arm
  [0, 6], [1, 7], // shoulder to hip (torso sides)
  [6, 7], // hip to hip
  [6, 8], [8, 10], // left leg
  [7, 9], [9, 11], // right leg
];

// Below this, MediaPipe's own confidence score means genuinely more guess
// than detection - flagged rather than drawn as confidently as everything
// else. See CONFIDENCE_THRESHOLD usage in extractPoseLandmarks below.
export const CONFIDENCE_THRESHOLD = 0.5;

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

// Two separate cached instances, not one switched dynamically - "IMAGE"
// mode is for a single still frame (Swing Sketch, Instant Replay); "VIDEO"
// mode is for the continuous live call, and expects an increasing
// timestamp on every call. Each is created once per app session, lazily,
// the first time it's actually needed - loading the WASM runtime and
// model file takes real time, so this makes every detection after the
// first one fast.
let cachedImageLandmarkerPromise: Promise<any> | null = null;
let cachedVideoLandmarkerPromise: Promise<any> | null = null;

export async function getImagePoseLandmarker() {
  if (!cachedImageLandmarkerPromise) {
    cachedImageLandmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
      });
    })();
  }
  return cachedImageLandmarkerPromise;
}

export async function getVideoPoseLandmarker() {
  if (!cachedVideoLandmarkerPromise) {
    cachedVideoLandmarkerPromise = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
      });
    })();
  }
  return cachedVideoLandmarkerPromise;
}

// Converts MediaPipe's raw, normalized (0-1) landmark output into the
// pixel-space points every consumer actually draws with, and marks which
// compact-array positions fell below CONFIDENCE_THRESHOLD.
export function extractPoseLandmarks(
  rawLandmarks: { x: number; y: number; visibility?: number }[],
  width: number,
  height: number
): { points: Point[]; lowConfidenceIndices: number[] } {
  const points: Point[] = POSE_LANDMARK_INDICES.map((i) => ({
    x: rawLandmarks[i].x * width,
    y: rawLandmarks[i].y * height,
  }));
  const lowConfidenceIndices = POSE_LANDMARK_INDICES
    .map((i, compactIndex) => ({ compactIndex, visibility: rawLandmarks[i].visibility ?? 1 }))
    .filter((l) => l.visibility < CONFIDENCE_THRESHOLD)
    .map((l) => l.compactIndex);
  return { points, lowConfidenceIndices };
}

// Draws the skeleton onto any 2D canvas context - connections between
// joints, plus a small dot at each one. Low-confidence joints/connections
// render dashed and faded rather than looking just as certain as
// everything else - the whole point of tracking confidence separately in
// the first place.
export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  lowConfidenceIndices: number[],
  color: string,
  width: number
) {
  const lowConf = new Set(lowConfidenceIndices);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  POSE_CONNECTIONS.forEach(([a, b]) => {
    const pa = points[a], pb = points[b];
    if (!pa || !pb) return;
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
  points.forEach((p, i) => {
    ctx.save();
    if (lowConf.has(i)) ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(3, width / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}
