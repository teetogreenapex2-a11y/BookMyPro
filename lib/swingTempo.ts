import { getImagePoseLandmarker } from "./poseDetection";

// Finds the four key moments of a golf swing and the tempo ratio, entirely
// in the browser, from the same pose model used for swing sketches.
//
// How it works: sample the clip ~30 times a second, track how high the
// hands are (average of both wrists) relative to the body, then:
//   address  - the start of the clip (hands at rest)
//   top      - hands at their highest point
//   backswing start - hands have risen 10% of the way to the top
//   impact   - after the top, the first time the hands come back down to
//              the address height
//   finish   - hands highest again after impact
// Tempo = (top - backswing start) / (impact - top). A ratio is used (not
// raw seconds) so slow-motion clips give the same answer.

export type SwingAnalysis = {
  tempoRatio: number;
  backswingMs: number;
  downswingMs: number;
  keyFrames: { address: number; top: number; impact: number; finish: number };
};

const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_WRIST = 15, RIGHT_WRIST = 16, LEFT_HIP = 23, RIGHT_HIP = 24;

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener("seeked", done); resolve(); };
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

export async function analyzeSwingTempo(
  url: string,
  onProgress?: (pct: number) => void
): Promise<{ ok: true; result: SwingAnalysis } | { ok: false; error: string }> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Couldn't load the video."));
    });
    const duration = video.duration;
    if (!isFinite(duration) || duration < 0.5) return { ok: false, error: "That clip is too short to analyze." };

    const landmarker = await getImagePoseLandmarker();
    const span = Math.min(duration, 20);
    const step = Math.max(1 / 30, span / 450);
    const samples: { t: number; handY: number }[] = [];

    for (let t = 0, n = 0; t < span; t += step, n++) {
      await seek(video, t);
      const res = landmarker.detect(video);
      const lm = res?.landmarks?.[0];
      if (lm) {
        const lw = lm[LEFT_WRIST], rw = lm[RIGHT_WRIST];
        const ls = lm[LEFT_SHOULDER], rs = lm[RIGHT_SHOULDER], lh = lm[LEFT_HIP], rh = lm[RIGHT_HIP];
        const vis = Math.min(lw.visibility ?? 1, rw.visibility ?? 1);
        if (vis >= 0.4) {
          const shoulderY = (ls.y + rs.y) / 2;
          const hipY = (lh.y + rh.y) / 2;
          const torso = Math.abs(hipY - shoulderY);
          if (torso > 0.03) {
            // 0 = shoulder line, bigger = higher hands (in torso lengths).
            samples.push({ t, handY: (shoulderY - (lw.y + rw.y) / 2) / torso });
          }
        }
      }
      if (n % 5 === 0) onProgress?.(Math.min(99, Math.round((t / span) * 100)));
    }
    onProgress?.(100);
    if (samples.length < 12) return { ok: false, error: "Couldn't see your whole body clearly. Film from the side or face-on with your full body in frame." };

    // Smooth a little (3-point average) so one bad frame doesn't create a fake peak.
    const sm = samples.map((s, i) => {
      const a = samples[Math.max(0, i - 1)].handY, b = s.handY, c = samples[Math.min(samples.length - 1, i + 1)].handY;
      return { t: s.t, y: (a + b + c) / 3 };
    });

    // Address = median of the first handful of frames (hands at rest).
    const head = sm.slice(0, Math.max(3, Math.floor(sm.length * 0.1))).map((s) => s.y).sort((a, b) => a - b);
    const addrY = head[Math.floor(head.length / 2)];

    // Top = highest hands in the first part of the clip, found before the
    // finish (the global peak can be the follow-through, so look for the
    // highest point that is followed by a clear drop).
    let topIdx = -1;
    let best = -Infinity;
    for (let i = 0; i < sm.length; i++) {
      const after = sm.slice(i + 1);
      if (after.length < 3) break;
      const drop = sm[i].y - Math.min(...after.slice(0, Math.max(3, Math.floor(sm.length * 0.4))).map((s) => s.y));
      if (sm[i].y > best && drop > 0.25 * Math.max(0.01, sm[i].y - addrY)) { best = sm[i].y; topIdx = i; }
    }
    if (topIdx < 0) return { ok: false, error: "Couldn't find a full swing in that clip." };
    const rise = sm[topIdx].y - addrY;
    if (rise < 0.35) return { ok: false, error: "Couldn't find a full swing in that clip." };

    // Backswing start: last frame before the top where the hands were still within 10% of the rise.
    let startIdx = 0;
    for (let i = topIdx; i >= 0; i--) {
      if (sm[i].y <= addrY + 0.1 * rise) { startIdx = i; break; }
    }
    // Impact: first frame after the top where the hands are back near address height.
    let impactIdx = -1;
    for (let i = topIdx + 1; i < sm.length; i++) {
      if (sm[i].y <= addrY + 0.15 * rise) { impactIdx = i; break; }
    }
    if (impactIdx < 0) return { ok: false, error: "Couldn't find impact. Make sure the clip includes the whole swing." };

    // Finish: highest hands after impact (the follow-through), else the last frame.
    let finishIdx = impactIdx;
    let fBest = -Infinity;
    for (let i = impactIdx; i < sm.length; i++) {
      if (sm[i].y > fBest) { fBest = sm[i].y; finishIdx = i; }
    }

    const backswing = sm[topIdx].t - sm[startIdx].t;
    const downswing = sm[impactIdx].t - sm[topIdx].t;
    if (backswing <= 0 || downswing <= 0) return { ok: false, error: "Couldn't time that swing." };
    const ratio = backswing / downswing;
    if (ratio < 0.8 || ratio > 8) return { ok: false, error: "That swing looked unusual - try a clearer clip." };

    return {
      ok: true,
      result: {
        tempoRatio: Math.round(ratio * 10) / 10,
        backswingMs: Math.round(backswing * 1000),
        downswingMs: Math.round(downswing * 1000),
        keyFrames: {
          address: Math.round(sm[Math.max(0, Math.min(startIdx, 2))].t * 100) / 100,
          top: Math.round(sm[topIdx].t * 100) / 100,
          impact: Math.round(sm[impactIdx].t * 100) / 100,
          finish: Math.round(sm[finishIdx].t * 100) / 100,
        },
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Couldn't analyze that video." };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
