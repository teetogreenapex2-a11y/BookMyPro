// Shared by every place in the app that does AI pose detection: Swing
// Sketch (one-off, on a captured frame), Instant Replay (one-off, on a
// paused recorded clip), and the live remote-lesson video call
// (continuous, on the live stream). Keeping this in one place means all
// three draw and score the exact same way, rather than three
// independently-drifting implementations.

// z is MediaPipe's depth estimate, in the same pixel scale as x (smaller = closer
// to the camera). Optional: callers that only have 2D points still work.
export type Point = { x: number; y: number; z?: number };

// MediaPipe's pose model returns 33 landmarks in a fixed order. These 17
// are the ones worth showing for a golf swing: shoulders/elbows/wrists,
// hips/knees/ankles, the nose (as a head/neck reference point), and
// heels/toes (so the feet read as actual feet, not lines that just stop
// at the ankle). Detailed face and hand landmarks exist in the raw data
// too, but add visual clutter without adding anything useful here.
// POSE_LANDMARK_INDICES is the map from "compact" position (what's
// actually stored and drawn) back to MediaPipe's own original index;
// POSE_CONNECTIONS below already refers to the compact positions, not
// MediaPipe's raw indices.
export const POSE_LANDMARK_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 0, 29, 30, 31, 32];
// Compact positions: 0/1 shoulders, 2/3 elbows, 4/5 wrists, 6/7 hips,
// 8/9 knees, 10/11 ankles (L/R each), 12 nose, 13/14 heels, 15/16 toes (L/R each).
export const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], // shoulder to shoulder
  [0, 2], [2, 4], // left arm
  [1, 3], [3, 5], // right arm
  [0, 6], [1, 7], // shoulder to hip (torso sides)
  [6, 7], // hip to hip
  [6, 8], [8, 10], // left leg
  [7, 9], [9, 11], // right leg
  [12, 0], [12, 1], // nose to each shoulder (neck)
  [10, 13], [10, 15], [13, 15], // left foot (ankle-heel-toe triangle)
  [11, 14], [11, 16], [14, 16], // right foot
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
  rawLandmarks: { x: number; y: number; z?: number; visibility?: number }[],
  width: number,
  height: number
): { points: Point[]; lowConfidenceIndices: number[] } {
  const points: Point[] = POSE_LANDMARK_INDICES.map((i) => ({
    x: rawLandmarks[i].x * width,
    y: rawLandmarks[i].y * height,
    z: (rawLandmarks[i].z ?? 0) * width,
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
// Exported so callers doing continuous video can compute this themselves
// each frame, to track a running maximum for a stable head size (see
// headRadiusOverride on drawPoseSkeleton below) - null if shoulders
// weren't both detected.
export function getShoulderWidth(points: Point[]): number | null {
  if (!points[0] || !points[1]) return null;
  return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
}

// Same idea as getShoulderWidth, for the hips - used the same way, to
// track a running maximum for the golf-specific "turn" measurements below.
export function getHipWidth(points: Point[]): number | null {
  if (!points[6] || !points[7]) return null;
  return Math.hypot(points[7].x - points[6].x, points[7].y - points[6].y);
}

export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  lowConfidenceIndices: number[],
  color: string,
  width: number,
  // Only meaningful for continuous video - see the callers in
  // InstructorVideosClient/SessionClient, which track the largest
  // shoulder width ever observed in the session (typically address,
  // where the golfer is most square to the camera) and lock the head
  // size to that, rather than letting it visibly grow and shrink as the
  // body rotates through the swing and the shoulders foreshorten toward
  // the camera. Swing Sketch's single-frame use never passes this, since
  // there's no "over time" for the size to fluctuate across in the first place.
  headRadiusOverride?: number | null
) {
  const lowConf = new Set(lowConfidenceIndices);
  let shoulderWidth: number | null = null;
  // The nose is a much harder landmark to detect confidently than the
  // shoulders/hips - most obviously right at address, where the golfer's
  // head is down looking at the ball rather than facing the camera. When
  // its position isn't trustworthy, estimate the head as sitting just
  // above the shoulder midpoint instead, using a corrected copy of the
  // points array so the neck connection lines (drawn generically below,
  // same as every other connection) and the head circle both end up
  // using this same, consistent position - rather than the nose quietly
  // failing to draw at all while everything connected to it goes missing
  // right along with it.
  let effectivePoints = points;
  let effectiveHeadRadius: number | null = headRadiusOverride ?? null;
  if (points[0] && points[1]) {
    shoulderWidth = getShoulderWidth(points);
    if (effectiveHeadRadius == null && shoulderWidth) effectiveHeadRadius = shoulderWidth * 0.3;
    const noseValid = points[12] && Number.isFinite(points[12].x) && Number.isFinite(points[12].y) && !lowConf.has(12);
    if (!noseValid && effectiveHeadRadius != null) {
      const shoulderMid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      effectivePoints = points.slice();
      effectivePoints[12] = { x: shoulderMid.x, y: shoulderMid.y - effectiveHeadRadius * 1.5 };
      lowConf.add(12); // an estimate, not a real detection - still shown faded like any other uncertain point
    }
  }

  drawAnatomicalBones(ctx, effectivePoints, lowConf, color, width, effectiveHeadRadius);
}

// An anatomical skeleton drawn on top of the 17 tracked joints: skull and
// jaw, a vertebral column, ribcage, clavicles, pelvis, tapered long bones
// with rounded ends (radius and ulna, tibia and fibula as pairs), plus
// hands and feet. It is a 2D drawing driven by the joint positions - the
// bones follow the golfer, they are not a true 3D model.
function drawAnatomicalBones(
  ctx: CanvasRenderingContext2D,
  P: Point[],
  lowConf: Set<number>,
  color: string,
  width: number,
  headRadius: number | null
) {
  const ok = (i: number) => !!P[i] && Number.isFinite(P[i].x) && Number.isFinite(P[i].y);
  const Zv = (i: number) => (P[i] && Number.isFinite(P[i].z as number) ? (P[i].z as number) : 0);
  const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
  const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
  const len = (a: Point) => Math.hypot(a.x, a.y);
  const unit = (a: Point): Point => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
  const perp = (a: Point): Point => ({ x: -a.y, y: a.x });
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const sw = ok(0) && ok(1) ? len(sub(P[0], P[1])) : null;
  const hwid = ok(6) && ok(7) ? len(sub(P[6], P[7])) : null;
  const u = sw || (hwid ? hwid * 1.2 : 110);
  const t = Math.max(width * 1.5, u * 0.085); // base bone thickness
  const edge = "rgba(40, 30, 20, 0.55)";

  // Darkens a "#rrggbb" color toward the bone edge tone - used for limbs on the far side.
  const shade = (hex: string, k: number) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const f = (v: number) => Math.round(v * k);
    return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
  };

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = edge;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 6;

  const faded = (...idx: number[]) => idx.some((i) => lowConf.has(i));
  // far = true draws the limb darker and a touch smaller (it is further away);
  // sc scales bone thickness for perspective.
  const withAlpha = (idx: number[], fn: () => void, far = false) => {
    ctx.save();
    if (faded(...idx)) ctx.globalAlpha = 0.45;
    if (far) ctx.fillStyle = shade(color, 0.8);
    fn();
    ctx.restore();
  };
  const knob = (c: Point, r: number) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };
  const bone = (a: Point, b: Point, wEnd: number, wMid: number) => {
    const d = unit(sub(b, a));
    const n = perp(d);
    const m = mid(a, b);
    ctx.beginPath();
    ctx.moveTo(a.x + n.x * wEnd, a.y + n.y * wEnd);
    ctx.quadraticCurveTo(m.x + n.x * wMid, m.y + n.y * wMid, b.x + n.x * wEnd, b.y + n.y * wEnd);
    ctx.lineTo(b.x - n.x * wEnd, b.y - n.y * wEnd);
    ctx.quadraticCurveTo(m.x - n.x * wMid, m.y - n.y * wMid, a.x - n.x * wEnd, a.y - n.y * wEnd);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.stroke();
    knob(a, wEnd * 1.15);
    knob(b, wEnd * 1.15);
  };
  const thin = (a: Point, b: Point, w: number) => {
    ctx.save();
    ctx.lineWidth = w;
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };

  // ---- Depth: which side is nearer, how far the shoulders / hips are turned
  const sideZ = (ids: number[]) => {
    const v = ids.filter(ok).map(Zv);
    return v.length ? v.reduce((p, c) => p + c, 0) / v.length : 0;
  };
  const leftZ = sideZ([0, 2, 4, 6, 8, 10]);
  const rightZ = sideZ([1, 3, 5, 7, 9, 11]);
  const leftIsFar = leftZ > rightZ; // larger z = further from the camera
  const persp = (ids: number[]) => clamp(1 - sideZ(ids) / (u * 5), 0.85, 1.2);

  // Yaw of a left-to-right pair of joints: cos = how square to the camera, sin = turned.
  const yawOf = (l: number, r: number) => {
    if (!ok(l) || !ok(r)) return { cos: 1, sin: 0, e: { x: 1, y: 0 } as Point };
    const dx = P[r].x - P[l].x, dy = P[r].y - P[l].y, dz = Zv(r) - Zv(l);
    const w3 = Math.max(Math.hypot(dx, dy, dz), 1e-6);
    return { cos: clamp(Math.hypot(dx, dy) / w3, 0, 1), sin: clamp(dz / w3, -1, 1), e: unit({ x: dx, y: dy }) };
  };
  const shY = yawOf(0, 1);
  const hpY = yawOf(6, 7);
  const sinS = Math.abs(shY.sin);
  // Which way the front of the body faces across the screen, read from the nose.
  let frontSgn = 1;
  if (ok(0) && ok(1) && ok(12)) {
    const dn = (P[12].x - (P[0].x + P[1].x) / 2) * shY.e.x + (P[12].y - (P[0].y + P[1].y) / 2) * shY.e.y;
    if (Math.abs(dn) > u * 0.02) frontSgn = dn > 0 ? 1 : -1;
  }

  const drawLeg = (h: number, k: number, a: number, heel: number, toe: number) => {
    const far = (h === 6) === leftIsFar;
    const tl = t * persp([h, k, a]);
    if (ok(h) && ok(k)) withAlpha([h, k], () => bone(P[h], P[k], tl * 0.95, tl * 0.5), far); // femur
    if (ok(k) && ok(a)) {
      withAlpha([k, a], () => {
        const d = unit(sub(P[a], P[k]));
        const n = perp(d);
        bone(add(P[k], mul(n, tl * 0.3)), add(P[a], mul(n, tl * 0.15)), tl * 0.7, tl * 0.38); // tibia
        bone(add(P[k], mul(n, -tl * 0.55)), add(P[a], mul(n, -tl * 0.4)), tl * 0.38, tl * 0.22); // fibula
        if (ok(h)) {
          const c = add(P[k], mul(unit(sub(P[h], P[k])), tl * 0.2));
          knob(c, tl * 0.7); // kneecap
        }
      }, far);
    }
    if (ok(a) && ok(heel) && ok(toe)) {
      withAlpha([a, heel, toe], () => {
        knob(P[heel], tl * 0.75);
        const d = unit(sub(P[toe], P[heel]));
        const n = perp(d);
        for (let i = -2; i <= 2; i++) {
          const tip = add(P[toe], add(mul(n, i * tl * 0.28), mul(d, tl * 0.5 - Math.abs(i) * tl * 0.1)));
          thin(add(P[heel], mul(d, len(sub(P[toe], P[heel])) * 0.45)), tip, tl * 0.34);
        }
        thin(P[a], P[toe], tl * 0.5);
      }, far);
    }
  };

  const drawArm = (sh: number, el: number, wr: number) => {
    const far = (sh === 0) === leftIsFar;
    const tl = t * persp([sh, el, wr]);
    if (ok(sh) && ok(el)) withAlpha([sh, el], () => bone(P[sh], P[el], tl * 0.8, tl * 0.42), far); // humerus
    if (ok(el) && ok(wr)) {
      withAlpha([el, wr], () => {
        const d = unit(sub(P[wr], P[el]));
        const n = perp(d);
        bone(add(P[el], mul(n, tl * 0.28)), add(P[wr], mul(n, tl * 0.3)), tl * 0.5, tl * 0.3); // ulna
        bone(add(P[el], mul(n, -tl * 0.3)), add(P[wr], mul(n, -tl * 0.22)), tl * 0.42, tl * 0.26); // radius
        const flen = len(sub(P[wr], P[el]));
        const palmEnd = add(P[wr], mul(d, flen * 0.22));
        ctx.save();
        ctx.translate((P[wr].x + palmEnd.x) / 2, (P[wr].y + palmEnd.y) / 2);
        ctx.rotate(Math.atan2(d.y, d.x));
        ctx.beginPath();
        ctx.ellipse(0, 0, flen * 0.13, tl * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.restore();
        for (let i = -1.5; i <= 1.5; i += 1) {
          const tip = add(add(palmEnd, mul(d, flen * 0.16)), mul(n, i * tl * 0.34));
          thin(add(palmEnd, mul(n, i * tl * 0.3)), tip, tl * 0.26);
        }
      }, far);
    }
  };

  // Far limbs first, then the torso on top of them, then the near arm over the torso.
  const legs: [number, number, number, number, number][] = [[6, 8, 10, 13, 15], [7, 9, 11, 14, 16]];
  const arms: [number, number, number][] = [[0, 2, 4], [1, 3, 5]];
  const farFirst = <T extends number[]>(list: T[]) =>
    list.slice().sort((x, y) => (((x[0] === 0 || x[0] === 6) === leftIsFar) ? 0 : 1) - (((y[0] === 0 || y[0] === 6) === leftIsFar) ? 0 : 1));
  farFirst(legs).forEach((l) => drawLeg(...l));
  const orderedArms = farFirst(arms);
  drawArm(...orderedArms[0]);

  // ---- Pelvis, spine, ribcage, clavicles, head
  if (ok(0) && ok(1) && ok(6) && ok(7)) {
    const S = mid(P[0], P[1]);
    const Hc = mid(P[6], P[7]);
    const axis = sub(S, Hc);
    const L = len(axis);
    const a = unit(axis);
    const e = unit(sub(P[7], P[6]));
    const hs = Math.max(hpY.cos ? len(sub(P[7], P[6])) / Math.max(hpY.cos, 0.35) / 2 : u * 0.22, u * 0.22); // true (un-foreshortened) half width
    const hsl = hs * Math.max(hpY.cos, 0.35); // what shows on screen

    withAlpha([0, 1, 6, 7], () => {
      // pelvis: two iliac wings joined at the sacrum, narrowing as the hips turn side-on
      const wing = (H: Point, side: number) => {
        const top = add(Hc, mul(a, hs * 0.75));
        const out = add(add(H, mul(e, side * hsl * 0.7)), mul(a, hs * 1.25));
        const edgeP = add(H, mul(e, side * hsl * 0.38));
        const low = add(H, mul(a, -hs * 0.1));
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.quadraticCurveTo(out.x, out.y, edgeP.x, edgeP.y);
        ctx.lineTo(low.x, low.y);
        const bc = add(Hc, mul(a, -hs * 0.45));
        ctx.lineTo(bc.x, bc.y);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.stroke();
      };
      wing(P[6], -1);
      wing(P[7], 1);
      // sacrum sits toward the back of the pelvis
      const backOff = mul(e, -frontSgn * Math.abs(hpY.sin) * hs * 0.35);
      ctx.beginPath();
      const sTop = add(add(Hc, mul(a, hs * 0.6)), backOff);
      const sBot = add(add(Hc, mul(a, -hs * 0.55)), backOff);
      ctx.moveTo(sTop.x + e.x * hsl * 0.3, sTop.y + e.y * hsl * 0.3);
      ctx.lineTo(sBot.x, sBot.y);
      ctx.lineTo(sTop.x - e.x * hsl * 0.3, sTop.y - e.y * hsl * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
      knob(P[6], t * 0.95);
      knob(P[7], t * 0.95);

      // ribcage: each rib is a horizontal ring seen at the shoulders' current turn -
      // the front half solid, the back half faded - so the chest visibly rotates.
      const E = shY.e;
      const RIBS = 7;
      const halfW = (u / Math.max(shY.cos, 0.35)) * 0.5; // true half width
      for (let k = 0; k < RIBS; k++) {
        const f = 0.5 + (k / (RIBS - 1)) * 0.42;
        const c = add(Hc, mul(axis, f));
        const widest = 1 - Math.abs((k - 2) / 4.5) * 0.45;
        const aw = halfW * widest;
        const bw = aw * 0.62;
        const STEPS = 28;
        const pt = (th: number): { p: Point; front: boolean } => {
          const lat = aw * Math.cos(th);
          const fr = bw * Math.sin(th);
          const along = lat * shY.cos + fr * sinS * frontSgn;
          const up = -fr * 0.16; // slight downward view so the rings read as ellipses
          return { p: add(add(c, mul(E, along)), mul(a, up)), front: fr >= 0 };
        };
        ([true, false] as boolean[]).forEach((frontHalf) => {
          ctx.save();
          if (!frontHalf) ctx.globalAlpha *= 0.4;
          ctx.beginPath();
          let started = false;
          for (let i = 0; i <= STEPS; i++) {
            const th = (i / STEPS) * Math.PI * 2;
            const q = pt(th);
            if (q.front !== frontHalf) { started = false; continue; }
            if (!started) { ctx.moveTo(q.p.x, q.p.y); started = true; } else ctx.lineTo(q.p.x, q.p.y);
          }
          ctx.lineWidth = t * 0.62;
          ctx.strokeStyle = edge;
          ctx.stroke();
          ctx.lineWidth = t * 0.46;
          ctx.strokeStyle = ctx.fillStyle as string;
          ctx.stroke();
          ctx.restore();
        });
      }
      // sternum on the front face, spine on the back - they separate as the chest turns
      const bOff = (halfW * 0.55 * 0.62) * sinS * frontSgn;
      const frontShift = mul(E, bOff);
      const backShift = mul(E, -bOff);
      const stTop = add(add(Hc, mul(axis, 0.92)), frontShift);
      const stBot = add(add(Hc, mul(axis, 0.66)), frontShift);
      ctx.save();
      ctx.lineWidth = t * 0.7;
      ctx.strokeStyle = edge;
      ctx.beginPath(); ctx.moveTo(stTop.x, stTop.y); ctx.lineTo(stBot.x, stBot.y); ctx.stroke();
      ctx.lineWidth = t * 0.5;
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.stroke();
      ctx.restore();

      const VERT = 17;
      for (let i = 0; i < VERT; i++) {
        const f = 0.02 + (i / (VERT - 1)) * 0.98;
        // below the waist the spine follows the pelvis, above it the shoulders - the twist between them
        const mix = clamp((f - 0.35) / 0.4, 0, 1);
        const shift = add(mul(E, -(halfW * 0.3) * Math.abs(hpY.sin) * frontSgn * (1 - mix)), mix > 0 ? backShift : { x: 0, y: 0 });
        const c = add(add(Hc, mul(axis, f)), shift);
        const w = t * (1.15 - 0.45 * f);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.atan2(a.y, a.x) + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, w, (L / VERT) * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      [0, 1].forEach((i) => {
        const sh = P[i];
        const cm = add(mid(S, sh), mul(a, -t * 0.25));
        ctx.save();
        ctx.lineWidth = t * 0.55;
        ctx.strokeStyle = edge;
        ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.quadraticCurveTo(cm.x, cm.y, sh.x, sh.y); ctx.stroke();
        ctx.lineWidth = t * 0.38;
        ctx.strokeStyle = ctx.fillStyle as string;
        ctx.stroke();
        ctx.restore();
      });
      knob(P[0], t * 0.9);
      knob(P[1], t * 0.9);
    });

    // ---- Neck and skull: faces the camera, turns, or shows the back of the head
    if (ok(12)) {
      withAlpha([12], () => {
        const nose = P[12];
        const r = headRadius ?? u * 0.3;
        const down = unit(sub(S, nose));
        const base = add(nose, mul(down, r * 0.9));
        for (let i = 0; i < 5; i++) {
          const c = add(base, mul(sub(S, base), i / 4));
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(Math.atan2(down.y, down.x) + Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, t * 0.5, t * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
        const zS = (Zv(0) + Zv(1)) / 2;
        const noseDepth = Zv(12) - zS; // negative = nose is in front of the shoulders (toward camera)
        const turn = clamp(sinS * frontSgn, -1, 1); // how far the face is turned along the screen
        const facing = noseDepth < u * 0.08 || Math.abs(turn) > 0.55;
        const eyeSpread = Math.sqrt(Math.max(0, 1 - turn * turn));
        ctx.save();
        ctx.translate(nose.x, nose.y);
        ctx.rotate(Math.atan2(down.y, down.x) - Math.PI / 2);
        // The head's local x axis may be mirrored relative to the shoulders' lateral axis.
        const lateralSign = (shY.e.x * Math.cos(Math.atan2(down.y, down.x) - Math.PI / 2) + shY.e.y * Math.sin(Math.atan2(down.y, down.x) - Math.PI / 2)) >= 0 ? 1 : -1;
        const tx = turn * lateralSign;
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.1, r * 0.9 * (0.88 + 0.12 * eyeSpread), r * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // jaw
        ctx.beginPath();
        const jx = tx * r * 0.15;
        ctx.moveTo(-r * 0.62 * eyeSpread + jx, r * 0.55);
        ctx.quadraticCurveTo(-r * 0.7 * eyeSpread + jx, r * 1.15, jx, r * 1.2);
        ctx.quadraticCurveTo(r * 0.7 * eyeSpread + jx, r * 1.15, r * 0.62 * eyeSpread + jx, r * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (facing) {
          ctx.fillStyle = "rgba(30, 24, 18, 0.85)";
          [-1, 1].forEach((sd) => {
            const ex = sd * r * 0.36 * eyeSpread + tx * r * 0.55;
            if (Math.abs(ex) > r * 0.88) return; // rotated out of view
            ctx.beginPath();
            ctx.ellipse(ex, r * 0.05, r * 0.2 * (0.55 + 0.45 * eyeSpread), r * 0.22, 0, 0, Math.PI * 2);
            ctx.fill();
          });
          const nx = tx * r * 0.7;
          ctx.beginPath();
          ctx.moveTo(nx, r * 0.3);
          ctx.lineTo(nx - r * 0.1 * eyeSpread, r * 0.55);
          ctx.lineTo(nx + r * 0.1 * eyeSpread, r * 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "rgba(30, 24, 18, 0.7)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-r * 0.32 * eyeSpread + jx, r * 0.78);
          ctx.lineTo(r * 0.32 * eyeSpread + jx, r * 0.78);
          ctx.stroke();
        } else {
          // back of the skull: a faint suture line instead of a face
          ctx.strokeStyle = "rgba(30, 24, 18, 0.45)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.05);
          ctx.quadraticCurveTo(r * 0.12, -r * 0.3, 0, r * 0.35);
          ctx.stroke();
        }
        ctx.restore();
      });
    }
  }

  drawArm(...orderedArms[1]);

  ctx.restore();
}

// ---- Angle measurements -------------------------------------------------
// Real geometry computed from the joint positions MediaPipe already gave
// us - not a new detection step, just math on data that's already there.
// Compact indices, per the layout above: 0/1 shoulders, 2/3 elbows, 4/5
// wrists, 6/7 hips, 8/9 knees, 10/11 ankles (left/right each), 12 nose.

function tiltFromHorizontal(p1: Point, p2: Point): number {
  const rad = Math.atan2(Math.abs(p2.y - p1.y), Math.abs(p2.x - p1.x));
  return rad * (180 / Math.PI);
}

function tiltFromVertical(p1: Point, p2: Point): number {
  const rad = Math.atan2(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  return rad * (180 / Math.PI);
}

// The interior angle at `vertex`, between the rays to `a` and `b` - e.g.
// for a knee, a=hip, vertex=knee, b=ankle. A straight leg reads close to
// 180 degrees; a deeply flexed knee reads much lower.
function interiorAngle(a: Point, vertex: Point, b: Point): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2)));
  return Math.acos(cos) * (180 / Math.PI);
}

export type PoseAngle = { label: string; value: number; unit: "°" | "%"; uncertain: boolean; flagged?: boolean };

// Golf-specific measurements below need a "reference" from earlier in the
// same swing (address position, essentially), the same way headReference
// already does for Head movement - a single frame alone can't say how
// much someone has turned or shifted, only where they are right now.
// A caller tracks these across frames (see the maxShoulderWidthRef /
// maxHipWidthRef pattern already used for head sizing) and passes
// whatever it has; each measurement below simply doesn't appear until
// its own reference is available, same "no reference, no reading" rule
// Head movement already follows.
export type SwingReferences = {
  // Running maximum shoulder/hip width ever seen this swing. Address -
  // square to the camera - is normally when a golfer's shoulders and
  // hips are at their widest on-screen; as they turn away from the
  // camera during the backswing, the same real width foreshortens to a
  // narrower on-screen distance. That narrowing is what "Shoulder turn"
  // and "Hip turn" below actually measure - not a true 3D rotation
  // (this is a single 2D camera, there's no real depth to measure),
  // but a reasonable stand-in that needs no extra data beyond what's
  // already tracked for the head-size lock.
  maxShoulderWidth?: number | null;
  maxHipWidth?: number | null;
  // Hip midpoint captured at address, for Hip sway below - same pattern
  // as headReference for Head movement.
  hipReference?: Point | null;
  // Spine angle captured at address, for Posture change below.
  spineAngleReference?: number | null;
};

// Same "flag, don't hide" approach as the skeleton itself - a measurement
// computed from a low-confidence joint is still shown, just marked
// uncertain, so the UI can decide how to present that (e.g. dimmed, or a
// "~" prefix) rather than silently omitting it.
// headReference, when provided, is the head (nose) position captured at
// some earlier reference moment - typically address position, the first
// frame detected after turning the overlay on. Head movement is only
// meaningful relative to that starting point, so this measurement simply
// doesn't appear at all when no reference is given (e.g. Swing Sketch,
// which only ever analyzes one still frame with no "over time" to
// compare against).
export function computePoseAngles(
  points: Point[],
  lowConfidenceIndices: number[],
  headReference?: Point | null,
  swingRefs?: SwingReferences
): PoseAngle[] {
  const lowConf = new Set(lowConfidenceIndices);
  const results: PoseAngle[] = [];
  let spineAngleThisFrame: number | null = null;

  if (points[0] && points[1]) {
    results.push({
      label: "Shoulder tilt",
      value: Math.round(tiltFromHorizontal(points[0], points[1])),
      unit: "°",
      uncertain: lowConf.has(0) || lowConf.has(1),
    });
  }
  if (points[6] && points[7]) {
    results.push({
      label: "Hip tilt",
      value: Math.round(tiltFromHorizontal(points[6], points[7])),
      unit: "°",
      uncertain: lowConf.has(6) || lowConf.has(7),
    });
  }
  if (points[0] && points[1] && points[6] && points[7]) {
    const shoulderMid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const hipMid = { x: (points[6].x + points[7].x) / 2, y: (points[6].y + points[7].y) / 2 };
    spineAngleThisFrame = tiltFromVertical(hipMid, shoulderMid);
    results.push({
      label: "Spine angle",
      value: Math.round(spineAngleThisFrame),
      unit: "°",
      uncertain: lowConf.has(0) || lowConf.has(1) || lowConf.has(6) || lowConf.has(7),
    });
  }
  if (points[6] && points[8] && points[10]) {
    results.push({
      label: "Left knee flex",
      value: Math.round(interiorAngle(points[6], points[8], points[10])),
      unit: "°",
      uncertain: lowConf.has(6) || lowConf.has(8) || lowConf.has(10),
    });
  }
  if (points[7] && points[9] && points[11]) {
    results.push({
      label: "Right knee flex",
      value: Math.round(interiorAngle(points[7], points[9], points[11])),
      unit: "°",
      uncertain: lowConf.has(7) || lowConf.has(9) || lowConf.has(11),
    });
  }
  if (points[0] && points[2] && points[4]) {
    results.push({
      label: "Left elbow flex",
      value: Math.round(interiorAngle(points[0], points[2], points[4])),
      unit: "°",
      uncertain: lowConf.has(0) || lowConf.has(2) || lowConf.has(4),
    });
  }
  if (points[1] && points[3] && points[5]) {
    results.push({
      label: "Right elbow flex",
      value: Math.round(interiorAngle(points[1], points[3], points[5])),
      unit: "°",
      uncertain: lowConf.has(1) || lowConf.has(3) || lowConf.has(5),
    });
  }
  // Ankle-to-ankle distance as a percentage of shoulder width - the
  // standard, informal way instructors already talk about stance width
  // ("about shoulder-width", "a bit wider than shoulders").
  if (points[0] && points[1] && points[10] && points[11]) {
    const shoulderDist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const ankleDist = Math.hypot(points[11].x - points[10].x, points[11].y - points[10].y);
    if (shoulderDist > 0) {
      results.push({
        label: "Stance width",
        value: Math.round((ankleDist / shoulderDist) * 100),
        unit: "%",
        uncertain: lowConf.has(0) || lowConf.has(1) || lowConf.has(10) || lowConf.has(11),
      });
    }
  }
  // How far forward/back the head sits over the base of the feet -
  // distinct from spine angle, which only looks at the hip-to-shoulder
  // segment and says nothing about where the head itself ends up.
  if (points[10] && points[11] && points[12]) {
    const ankleMid = { x: (points[10].x + points[11].x) / 2, y: (points[10].y + points[11].y) / 2 };
    results.push({
      label: "Head lean",
      value: Math.round(tiltFromVertical(ankleMid, points[12])),
      unit: "°",
      uncertain: lowConf.has(10) || lowConf.has(11) || lowConf.has(12),
    });
  }
  // How far the head has drifted from the reference moment (typically
  // address position) - scaled against shoulder width so "10%" means the
  // same real amount of movement regardless of how close the camera is.
  if (headReference && points[0] && points[1] && points[12]) {
    const shoulderDist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    if (shoulderDist > 0) {
      const drift = Math.hypot(points[12].x - headReference.x, points[12].y - headReference.y);
      results.push({
        label: "Head movement",
        value: Math.round((drift / shoulderDist) * 100),
        unit: "%",
        uncertain: lowConf.has(12),
      });
    }
  }

  // ---- Golf-specific, reference-dependent measurements ------------------
  // Everything below needs an address-position reference from swingRefs
  // and simply doesn't appear without one - same rule Head movement
  // already follows for headReference.
  let shoulderTurn: number | null = null;
  let hipTurn: number | null = null;

  if (swingRefs?.maxShoulderWidth && points[0] && points[1]) {
    const currentWidth = getShoulderWidth(points);
    if (currentWidth != null) {
      const ratio = Math.max(-1, Math.min(1, currentWidth / swingRefs.maxShoulderWidth));
      shoulderTurn = Math.acos(ratio) * (180 / Math.PI);
      results.push({
        label: "Shoulder turn",
        value: Math.round(shoulderTurn),
        unit: "°",
        uncertain: lowConf.has(0) || lowConf.has(1),
      });
    }
  }
  if (swingRefs?.maxHipWidth && points[6] && points[7]) {
    const currentWidth = getHipWidth(points);
    if (currentWidth != null) {
      const ratio = Math.max(-1, Math.min(1, currentWidth / swingRefs.maxHipWidth));
      hipTurn = Math.acos(ratio) * (180 / Math.PI);
      results.push({
        label: "Hip turn",
        value: Math.round(hipTurn),
        unit: "°",
        uncertain: lowConf.has(6) || lowConf.has(7),
      });
    }
  }
  // "X-Factor" - how much further the shoulders have turned than the
  // hips. A bigger gap is the coiled, stored-up rotation instructors
  // look for at the top of the backswing; a gap near zero usually means
  // the hips and shoulders turned together instead ("all arms" swings
  // tend to show this).
  if (shoulderTurn != null && hipTurn != null) {
    results.push({
      label: "X-Factor",
      value: Math.round(shoulderTurn - hipTurn),
      unit: "°",
      uncertain: lowConf.has(0) || lowConf.has(1) || lowConf.has(6) || lowConf.has(7),
    });
  }

  // Hip sway - lateral hip drift from address, same technique as Head
  // movement above but for the hips, scaled against shoulder width so it
  // reads the same regardless of camera distance. A rough stand-in for
  // weight shift: a big sideways hip slide (rather than a turn) away
  // from the target during the backswing is the classic "sway" fault.
  if (swingRefs?.hipReference && points[0] && points[1] && points[6] && points[7]) {
    const shoulderDist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    if (shoulderDist > 0) {
      const hipMid = { x: (points[6].x + points[7].x) / 2, y: (points[6].y + points[7].y) / 2 };
      // Signed, not just distance - which direction matters for sway,
      // unlike head movement where any drift is worth flagging equally.
      const sway = ((hipMid.x - swingRefs.hipReference.x) / shoulderDist) * 100;
      results.push({
        label: "Hip sway",
        value: Math.round(sway),
        unit: "%",
        uncertain: lowConf.has(6) || lowConf.has(7),
      });
    }
  }

  // Posture change - how much the spine angle has moved from address.
  // A golfer standing up out of their posture during the downswing
  // ("early extension") shows up here as spine angle dropping toward
  // vertical (a large negative change); flagged rather than just shown,
  // since this specific direction/size of change is a known fault worth
  // calling out rather than leaving the instructor to notice the number.
  if (swingRefs?.spineAngleReference != null && spineAngleThisFrame != null) {
    const change = spineAngleThisFrame - swingRefs.spineAngleReference;
    results.push({
      label: "Posture change",
      value: Math.round(change),
      unit: "°",
      uncertain: lowConf.has(0) || lowConf.has(1) || lowConf.has(6) || lowConf.has(7),
      flagged: change < -12,
    });
  }

  return results;
}
