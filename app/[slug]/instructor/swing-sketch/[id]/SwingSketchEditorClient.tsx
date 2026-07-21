"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SwingCanvas, { SwingCanvasHandle } from "@/components/SwingCanvas";

export default function SwingSketchEditorClient({
  slug, basePath, apiBase, id,
}: { slug: string; basePath: string; apiBase: string; id: string }) {
  const searchParams = useSearchParams();
  const isNew = id === "new";
  const playerIdFromQuery = searchParams.get("playerId");

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [label, setLabel] = useState("");
  const [playerId, setPlayerId] = useState(playerIdFromQuery || "");
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [shapesJson, setShapesJson] = useState<string | null>(null);

  const canvasHandleRef = useRef<SwingCanvasHandle | null>(null);

  useEffect(() => {
    if (isNew) {
      if (!playerIdFromQuery) setError("No player selected — go back and pick one.");
      return;
    }
    fetch(`${apiBase}/swing-sketches/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setLabel(data.label || "");
          setPlayerId(data.playerId);
          setPlayerName(data.playerName);
          setSourceUrl(data.sourceUrl);
          setShapesJson(data.shapesJson);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Couldn't load this sketch.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!canvasHandleRef.current || !playerId) return;
    setSaving(true);
    setError(null);
    try {
      const pngBlob = await canvasHandleRef.current.exportPng();
      const shapesData = canvasHandleRef.current.getShapesJson();

      const form = new FormData();
      form.append("image", pngBlob, "sketch.png");
      form.append("shapesJson", shapesData);
      if (label.trim()) form.append("label", label.trim());

      let res: Response;
      if (isNew) {
        form.append("playerId", playerId);
        res = await fetch(`${apiBase}/swing-sketches`, { method: "POST", body: form });
      } else {
        res = await fetch(`${apiBase}/swing-sketches/${id}`, { method: "PATCH", body: form });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't save this sketch.");
        setSaving(false);
        return;
      }
      const data = await res.json();
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      if (isNew) {
        window.location.href = `${basePath}/instructor/swing-sketch/${data.id}`;
      }
    } catch {
      setError("Couldn't save this sketch.");
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway)" }}>
      <header style={{ padding: "20px", color: "var(--chalk)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="display" style={{ fontSize: 16, fontWeight: 700 }}>Swing Sketch</span>
            <a href={`${basePath}/instructor/swing-sketch`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
              ← All sketches
            </a>
          </div>
          {playerName && <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>for {playerName}</p>}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 60px", background: "var(--chalk)", borderRadius: "16px 16px 0 0", minHeight: "70vh", paddingTop: 20 }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
        ) : error && !playerId ? (
          <p style={{ fontSize: 13, color: "#B23A3A" }}>{error}</p>
        ) : (
          <>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional) — e.g. Top of backswing"
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, marginBottom: 12 }}
            />

            <SwingCanvas
              initialSourceUrl={sourceUrl}
              initialShapesJson={shapesJson}
              onReady={(handle) => { canvasHandleRef.current = handle; }}
            />

            {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "10px 0 0" }}>{error}</p>}

            <button
              onClick={save}
              disabled={saving}
              style={{
                marginTop: 16, background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
                padding: "10px 20px", fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : saved ? "Saved" : "Save sketch"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
