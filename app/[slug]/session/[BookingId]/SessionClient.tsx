"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import SwingCanvas, { SwingCanvasHandle } from "@/components/SwingCanvas";
import { getVideoPoseLandmarker, extractPoseLandmarks, drawPoseSkeleton, computePoseAngles } from "@/lib/poseDetection";
import type { PoseAngle, Point } from "@/lib/poseDetection";
import PoseAngleBadges from "@/components/PoseAngleBadges";

declare global {
  interface Window {
    Daily?: any;
  }
}

// One entry per participant currently in the call - tracks their video/audio
// MediaStreamTrack objects as Daily reports them starting and stopping.
// This is the actual point of Call Object mode over Prebuilt: these are
// real, raw tracks we have direct access to, not something walled off
// inside an iframe - which is what buffering/replay (Phase 2) will need.
type ParticipantMedia = {
  sessionId: string;
  isLocal: boolean;
  userName: string;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
};

export default function SessionClient({
  videoCallUrl,
  playerId,
  playerName,
  isInstructor,
  basePath,
  apiBase,
}: {
  videoCallUrl: string;
  playerId: string;
  playerName: string;
  isInstructor: boolean;
  basePath: string;
  apiBase: string;
}) {
  const callRef = useRef<any>(null);
  const canvasHandleRef = useRef<SwingCanvasHandle | null>(null);
  const [sketchStarted, setSketchStarted] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [participants, setParticipants] = useState<Record<string, ParticipantMedia>>({});
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [aiAnalysisEnabled, setAiAnalysisEnabled] = useState(false);
  const [showPoseOverlay, setShowPoseOverlay] = useState(false);

  useEffect(() => {
    if (!isInstructor) return;
    fetch(`${apiBase}/players/${playerId}/ai-analysis`)
      .then((r) => r.json())
      .then((data) => setAiAnalysisEnabled(!!data.enabled))
      .catch(() => setAiAnalysisEnabled(false));
  }, [isInstructor, playerId, apiBase]);

  const updateParticipant = useCallback((sessionId: string, patch: Partial<ParticipantMedia>) => {
    setParticipants((prev) => ({
      ...prev,
      [sessionId]: { sessionId, isLocal: false, userName: "", videoTrack: null, audioTrack: null, ...prev[sessionId], ...patch },
    }));
  }, []);

  useEffect(() => {
    if (window.Daily) {
      joinCall();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@daily-co/daily-js";
    script.async = true;
    script.onload = joinCall;
    document.body.appendChild(script);
    return () => {
      callRef.current?.leave();
      callRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function joinCall() {
    if (!window.Daily || callRef.current) return;

    // subscribeToTracksAutomatically: true - the simple default for a
    // one-on-one lesson (two participants only), so we don't need to
    // manually manage subscriptions the way a larger group call would.
    const call = window.Daily.createCallObject({ subscribeToTracksAutomatically: true });
    callRef.current = call;

    call.on("track-started", (ev: any) => {
      const sessionId = ev.participant?.session_id;
      if (!sessionId) return;
      updateParticipant(sessionId, {
        isLocal: !!ev.participant?.local,
        userName: ev.participant?.local ? "You" : (isInstructor ? playerName : "Instructor"),
        ...(ev.track.kind === "video" ? { videoTrack: ev.track } : { audioTrack: ev.track }),
      });
    });

    call.on("track-stopped", (ev: any) => {
      const sessionId = ev.participant?.session_id;
      if (!sessionId) return;
      updateParticipant(sessionId, ev.track?.kind === "video" ? { videoTrack: null } : { audioTrack: null });
    });

    call.on("participant-left", (ev: any) => {
      const sessionId = ev.participant?.session_id;
      if (!sessionId) return;
      setParticipants((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    });

    call.on("error", (ev: any) => {
      setJoinError(ev?.errorMsg || "Something went wrong with the call.");
    });

    call
      .join({ url: videoCallUrl })
      .then(() => setJoined(true))
      .catch((err: any) => setJoinError(err?.message || "Couldn't join the call."));
  }

  function toggleMic() {
    const next = !micOn;
    callRef.current?.setLocalAudio(next);
    setMicOn(next);
  }

  function toggleCamera() {
    const next = !cameraOn;
    callRef.current?.setLocalVideo(next);
    setCameraOn(next);
  }

  function leaveCall() {
    callRef.current?.leave();
  }

  async function uploadSourcePhoto(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("source", file);
    // Reuses the same upload handling as the standalone Swing Sketch
    // creation flow - just gets us a hosted image URL back to draw on.
    const res = await fetch(`${apiBase}/swing-sketches/upload-source`, { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (res.ok && data.url) {
      setSourceUrl(data.url);
      setSketchStarted(true);
    }
  }

  async function saveSketch() {
    if (!canvasHandleRef.current) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const pngBlob = await canvasHandleRef.current.exportPng();
      const shapesData = canvasHandleRef.current.getShapesJson();
      const form = new FormData();
      form.append("image", pngBlob, "sketch.png");
      form.append("shapesJson", shapesData);
      form.append("playerId", playerId);
      form.append("label", `From live session - ${new Date().toLocaleDateString()}`);
      const res = await fetch(`${apiBase}/swing-sketches`, { method: "POST", body: form });
      if (res.ok) {
        setSaveMessage("Saved - this player can view it anytime from their Swing Sketches.");
      } else {
        setSaveMessage("Couldn't save that sketch - try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1B3A2F", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#B8862B" }}>REMOTE SESSION</div>
          <div style={{ color: "#F6F4EE", fontWeight: 700, fontSize: 15 }}>with {playerName}</div>
        </div>
        <a href={`${basePath}/instructor`} style={{ color: "#D7DED9", fontSize: 13, textDecoration: "none" }}>Back to dashboard</a>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "0 12px 12px" }}>
        <div style={{ width: "100%", minHeight: "45vh", background: "#000", borderRadius: 12, overflow: "hidden", position: "relative", display: "flex", flexWrap: "wrap", gap: 2 }}>
          {joinError && (
            <p style={{ color: "#FFF", padding: 20, fontSize: 13 }}>{joinError}</p>
          )}
          {!joined && !joinError && (
            <p style={{ color: "#FFF", padding: 20, fontSize: 13 }}>Joining...</p>
          )}
          {Object.values(participants)
            .filter((p) => !p.isLocal)
            .map((p) => (
              <VideoTile key={p.sessionId} participant={p} showOverlay={showPoseOverlay} />
            ))}
          {/* Local self-view - small, corner-positioned, like any normal call UI */}
          {Object.values(participants)
            .filter((p) => p.isLocal)
            .map((p) => (
              <div key={p.sessionId} style={{ position: "absolute", bottom: 10, right: 10, width: 100, height: 75, borderRadius: 8, overflow: "hidden", border: "2px solid rgba(255,255,255,0.3)" }}>
                <VideoTile participant={p} muted showOverlay={showPoseOverlay} />
              </div>
            ))}
        </div>

        {joined && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={toggleMic} style={{ background: micOn ? "#333" : "#B23A3A", color: "#FFF", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700 }}>
              {micOn ? "Mute" : "Unmute"}
            </button>
            <button onClick={toggleCamera} style={{ background: cameraOn ? "#333" : "#B23A3A", color: "#FFF", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700 }}>
              {cameraOn ? "Camera off" : "Camera on"}
            </button>
            {isInstructor && aiAnalysisEnabled && (
              <button
                onClick={() => setShowPoseOverlay((v) => !v)}
                style={{
                  background: showPoseOverlay ? "var(--gold)" : "#333", color: showPoseOverlay ? "var(--fairway)" : "#FFF",
                  border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700,
                }}
              >
                {showPoseOverlay ? "🤖 Body position: on" : "🤖 Show body position"}
              </button>
            )}
            <button onClick={leaveCall} style={{ background: "#B23A3A", color: "#FFF", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700 }}>
              Leave
            </button>
          </div>
        )}


        <div style={{ flex: 1, background: "#FFF", borderRadius: 12, padding: 14, minHeight: 320 }}>
          {!isInstructor ? (
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginTop: 40 }}>
              Your instructor may share a Swing Sketch here during your session.
            </p>
          ) : !sketchStarted ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                Snap or upload a photo of {playerName}'s swing to start sketching on it together.
              </p>
              <label style={{ display: "inline-block", background: "var(--fairway)", color: "var(--chalk)", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {uploading ? "Uploading..." : "Add a photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSourcePhoto(f); }}
                />
              </label>
            </div>
          ) : (
            <>
              <SwingCanvas initialSourceUrl={sourceUrl} onReady={(handle) => { canvasHandleRef.current = handle; }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                {saveMessage && <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>{saveMessage}</span>}
                <button
                  onClick={saveSketch}
                  disabled={saving}
                  style={{ background: "var(--gold)", color: "var(--fairway)", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}
                >
                  {saving ? "Saving..." : "Save sketch for player"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A single video tile - the actual reason Call Object mode was worth the
// extra build effort over Prebuilt: this attaches the raw MediaStreamTrack
// directly, giving real, direct access to the video data. React doesn't
// support srcObject as a normal prop, so it's set imperatively via a ref,
// same pattern Daily's own docs use for custom UI.
function VideoTile({ participant, muted, showOverlay }: { participant: ParticipantMedia; muted?: boolean; showOverlay?: boolean }) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseLoopRef = useRef<number | null>(null);
  const [poseAngles, setPoseAngles] = useState<PoseAngle[]>([]);
  const lastAngleUpdateRef = useRef(0);
  const headReferenceRef = useRef<Point | null>(null);

  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;
    const tracks: MediaStreamTrack[] = [];
    if (participant.videoTrack) tracks.push(participant.videoTrack);
    if (participant.audioTrack && !muted) tracks.push(participant.audioTrack);
    el.srcObject = tracks.length > 0 ? new MediaStream(tracks) : null;
  }, [participant.videoTrack, participant.audioTrack, muted]);

  useEffect(() => {
    if (!showOverlay) return;
    let cancelled = false;
    headReferenceRef.current = null; // fresh reference each time the overlay is turned on

    (async () => {
      const landmarker = await getVideoPoseLandmarker();
      if (cancelled) return;

      function loop() {
        if (cancelled) return;
        const video = videoElRef.current;
        const canvas = overlayCanvasRef.current;
        if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
              canvas.width = video.clientWidth;
              canvas.height = video.clientHeight;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const result = landmarker.detectForVideo(video, performance.now());
            const rawLandmarks = result?.landmarks?.[0];
            if (rawLandmarks) {
              const { points, lowConfidenceIndices } = extractPoseLandmarks(rawLandmarks, canvas.width, canvas.height);
              drawPoseSkeleton(ctx, points, lowConfidenceIndices, "#B8862B", 3);
              if (!headReferenceRef.current && points[12]) {
                headReferenceRef.current = points[12];
              }
              const now = performance.now();
              if (now - lastAngleUpdateRef.current > 200) {
                lastAngleUpdateRef.current = now;
                setPoseAngles(computePoseAngles(points, lowConfidenceIndices, headReferenceRef.current));
              }
            }
          }
        }
        poseLoopRef.current = requestAnimationFrame(loop);
      }
      poseLoopRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (poseLoopRef.current) cancelAnimationFrame(poseLoopRef.current);
      poseLoopRef.current = null;
      const canvas = overlayCanvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setPoseAngles([]);
    };
  }, [showOverlay]);

  return (
    <div style={{ position: "relative", flex: "1 1 300px", minHeight: 200, background: "#111" }}>
      <video ref={videoElRef} autoPlay playsInline muted={muted} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {showOverlay && (
        <canvas ref={overlayCanvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
      )}
      {showOverlay && poseAngles.length > 0 && (
        <div style={{ position: "absolute", bottom: 6, left: 6, right: 6 }}>
          <PoseAngleBadges angles={poseAngles} dark />
          <button
            onClick={() => { headReferenceRef.current = null; }}
            style={{
              background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.3)", color: "#D7DED9",
              borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600,
            }}
          >
            Reset reference
          </button>
        </div>
      )}
      {!participant.videoTrack && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 12 }}>
          {participant.userName || "Waiting..."}
        </div>
      )}
    </div>
  );
}
