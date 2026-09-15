"use client";

import { useState, useRef, useEffect } from "react";
import { upload } from "@vercel/blob/client";

export default function MyProfileEditor({
  apiBase, targetMembershipId, initialBio, initialPhotoUrl, title = "My Profile",
  description = "A photo and a fuller bio players see on your booking page - separate from the short specialty tag.",
}: {
  apiBase: string;
  // When set (the owner editing a specific team member), the initial
  // values below are used directly and no self-fetch happens - the
  // caller already has this data from the team list. Every save/upload
  // then includes this id so the change lands on the right person.
  targetMembershipId?: string;
  initialBio?: string | null;
  initialPhotoUrl?: string | null;
  title?: string;
  description?: string;
}) {
  const isTargeted = !!targetMembershipId;
  const [bio, setBio] = useState(initialBio || "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl || null);
  const [loading, setLoading] = useState(!isTargeted);
  const [savingBio, setSavingBio] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isTargeted) return;
    fetch(`${apiBase}/profile/bio`)
      .then((r) => r.json())
      .then((d) => {
        setBio(d.bio || "");
        setPhotoUrl(d.bioPhotoUrl || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  async function saveBio() {
    setSavingBio(true);
    setError(null);
    const res = await fetch(`${apiBase}/profile/bio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio, targetMembershipId }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't save this bio - try again.");
    }
    setSavingBio(false);
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    setError(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: `${apiBase}/profile/upload-token`,
        clientPayload: targetMembershipId ? JSON.stringify({ targetMembershipId }) : undefined,
      });
      // Save the URL directly here too, rather than depending solely on
      // the upload-token route's async onUploadCompleted webhook, which
      // requires Vercel Blob to be able to reach back to this server -
      // if that silently doesn't happen, the file still exists but the
      // database never learns its URL without this.
      const res = await fetch(`${apiBase}/profile/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, targetMembershipId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Photo uploaded, but couldn't save it - try again.");
      }
      setPhotoUrl(blob.url);
    } catch (err: any) {
      setError(err?.message || "Couldn't upload that photo - try again.");
    }
    setUploadingPhoto(false);
  }

  return (
    <div style={{ background: "#FFF", border: "1px solid #E5E0D0", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F", marginBottom: 4 }}>{title}</div>
      <p style={{ fontSize: 12, color: "#8A8571", margin: "0 0 14px" }}>{description}</p>

      {loading ? (
        <p style={{ fontSize: 13, color: "#8A8571" }}>Loading...</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
              background: "#F0EBDD", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {photoUrl ? (
                <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 22, color: "#B8A97A" }}>👤</span>
              )}
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                style={{
                  background: "#F6F4EE", border: "1px solid #E3D9C9", borderRadius: 8, padding: "7px 14px",
                  fontSize: 12.5, fontWeight: 600, color: "#1B3A2F", opacity: uploadingPhoto ? 0.6 : 1,
                }}
              >
                {uploadingPhoto ? "Uploading..." : photoUrl ? "Change photo" : "Add a photo"}
              </button>
            </div>
          </div>

          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell players a bit about this instructor - their background, coaching style, what they focus on..."
            rows={5}
            maxLength={2000}
            style={{
              width: "100%", border: "1px solid #DDD8C8", borderRadius: 8, padding: 10,
              fontFamily: "inherit", fontSize: 13, color: "#20241D", resize: "vertical", marginBottom: 10,
            }}
          />

          {error && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 10px" }}>{error}</p>}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={saveBio}
              disabled={savingBio}
              style={{
                background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8,
                padding: "8px 16px", fontSize: 13, fontWeight: 700, opacity: savingBio ? 0.6 : 1,
              }}
            >
              {savingBio ? "Saving..." : "Save bio"}
            </button>
            {saved && <span style={{ fontSize: 13, color: "#1B3A2F", fontWeight: 600 }}>Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}
