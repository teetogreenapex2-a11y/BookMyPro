"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { User } from "lucide-react";
import { formatTime12h } from "@/lib/time";

const TIMES = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
const DAY_MS = 24 * 60 * 60 * 1000;

// A slot is a single shared moment in the day — an instructor can only run
// one lesson or one fitting at a time, so there's exactly one timeline, not
// a separate one per service. `bookedServiceType` (set once something has
// requested or booked the slot) is what determines its color.
type Slot = { id: string; startTime: string; status: string; bookedServiceType: string | null; bookedIsRemote?: boolean };
type SyncLogEntry = {
  id: string;
  ranAt: string;
  success: boolean;
  bookingsCreated: number;
  slotsBlocked: number;
  slotsUnblocked: number;
  message: string | null;
  triggeredBy: string;
};
type Booking = {
  id: string;
  serviceType: string;
  fittingType: string | null;
  startTime: string;
  status: string;
  availabilityId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  priceCents: number;
  note?: { text: string } | null;
  player?: { name: string | null; email: string; handedness?: string | null; scoreOrHandicap?: string | null; commonIssues?: string | null } | null;
  instructor?: { id: string; user: { name: string | null } } | null;
};
type Player = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  packages: { id: string; label: string; lessonsRemaining: number; lessonsTotal: number }[];
};

export default function InstructorClient({
  calendarConnected, calendarProvider, remoteLessonsEnabled, viewerMembershipId, viewerRole, slug, basePath, apiBase,
}: { calendarConnected: boolean; calendarProvider: string; remoteLessonsEnabled: boolean; viewerMembershipId: string; viewerRole: string; slug: string; basePath: string; apiBase: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  // Which instructor's own calendar is currently shown — defaults to your
  // own, since each instructor now has their own independent timeline.
  const [viewingInstructorId, setViewingInstructorId] = useState(viewerMembershipId);
  const [noteSlot, setNoteSlot] = useState<Slot | null>(null);
  const [noteText, setNoteText] = useState("");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingContact, setBookingContact] = useState<{
    name: string; phone: string; email: string;
    handedness: string | null; scoreOrHandicap: string | null; commonIssues: string | null;
    instructorName: string | null;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [showSyncLog, setShowSyncLog] = useState(false);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [reviewingBooking, setReviewingBooking] = useState<Booking | null>(null);
  const reviewPanelRef = useRef<HTMLDivElement | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamInstructors, setTeamInstructors] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [newBookingForm, setNewBookingForm] = useState({
    slotId: "", serviceType: "lesson", fittingType: "driver", playerId: "", packageId: "", instructorMembershipId: "", isRemote: false,
  });
  const [newBookingError, setNewBookingError] = useState<string | null>(null);
  const [creatingBooking, setCreatingBooking] = useState(false);

  async function loadPendingBookings() {
    const res = await fetch(`${apiBase}/bookings`);
    if (res.ok) {
      const all: Booking[] = await res.json();
      setPendingBookings(all.filter((b) => b.status === "pending"));
    }
  }

  async function loadPlayers() {
    const res = await fetch(`${apiBase}/players`);
    if (res.ok) setPlayers(await res.json());
  }

  async function loadTeamInstructors() {
    const res = await fetch(`${apiBase}/instructors`);
    if (res.ok) {
      const list = await res.json();
      setTeamInstructors(list);
      // Most businesses have exactly one instructor — pre-fill it rather
      // than making the instructor pick themselves every time.
      if (list.length === 1) {
        setNewBookingForm((f) => ({ ...f, instructorMembershipId: list[0].id }));
      }
    }
  }

  async function createManualBooking() {
    const { slotId, serviceType, fittingType, playerId, packageId, instructorMembershipId, isRemote } = newBookingForm;
    if (!slotId || !playerId || !instructorMembershipId) {
      setNewBookingError("Pick a time, a player, and an instructor.");
      return;
    }
    setCreatingBooking(true);
    setNewBookingError(null);
    const res = await fetch(`${apiBase}/bookings/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availabilityId: slotId,
        serviceType,
        fittingType: serviceType === "fitting" ? fittingType : undefined,
        playerId,
        packageId: serviceType === "lesson" && packageId ? packageId : undefined,
        instructorMembershipId,
        isRemote: serviceType === "lesson" ? isRemote : false,
      }),
    });
    setCreatingBooking(false);
    if (res.ok) {
      setNewBookingOpen(false);
      setNewBookingForm((f) => ({ slotId: "", serviceType: "lesson", fittingType: "driver", playerId: "", packageId: "", instructorMembershipId: f.instructorMembershipId, isRemote: false }));
      loadSlots();
    } else {
      const data = await res.json();
      setNewBookingError(data.error || "Something went wrong.");
    }
  }

  async function loadSyncLog() {
    const res = await fetch(`${apiBase}/calendar/sync-log`);
    if (res.ok) setSyncLogs(await res.json());
  }

  useEffect(() => {
    if (calendarConnected) loadSyncLog();
    loadPendingBookings();
    loadPlayers();
    loadTeamInstructors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarConnected]);

  async function runSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`${apiBase}/calendar/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.synced === false) {
        setSyncMessage(data.error || data.reason || "Sync failed");
      } else {
        setSyncMessage(
          `Synced — ${data.bookingsCreated} booking${data.bookingsCreated === 1 ? "" : "s"} created, ` +
          `${data.slotsBlocked} slot${data.slotsBlocked === 1 ? "" : "s"} blocked, ` +
          `${data.slotsUnblocked} slot${data.slotsUnblocked === 1 ? "" : "s"} reopened`
        );
        loadSlots();
      }
      loadSyncLog();
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, viewingInstructorId]);

  // The review panel renders below the calendar grid, which can easily run
  // longer than the screen — without this, tapping a pending slot near the
  // top leaves the Confirm/Deny buttons scrolled out of view.
  useEffect(() => {
    if (reviewingBooking) {
      reviewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [reviewingBooking]);

  async function loadSlots() {
    setLoading(true);
    const start = weekStart.toISOString();
    const end = new Date(weekStart.getTime() + 7 * DAY_MS).toISOString();
    const res = await fetch(`${apiBase}/availability?start=${start}&end=${end}&instructorMembershipId=${viewingInstructorId}`);
    setSlots(await res.json());
    setLoading(false);
  }

  async function toggleSlot(slot: Slot) {
    if (slot.status === "booked") {
      await openNoteFor(slot);
      return;
    }
    if (slot.status === "pending") {
      await openReviewFor(slot);
      return;
    }
    const nextStatus = slot.status === "open" ? "closed" : "open";
    await fetch(`${apiBase}/availability`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slot.id, status: nextStatus }),
    });
    loadSlots();
  }

  async function openReviewFor(slot: Slot) {
    const res = await fetch(`${apiBase}/bookings`);
    const bookings: Booking[] = await res.json();
    const match = bookings.find((b) => b.availabilityId === slot.id && b.status === "pending");
    if (match) {
      setReviewingBooking(match);
      setReviewMessage(null);
    }
  }

  async function confirmBooking(booking: Booking) {
    setReviewing(true);
    const res = await fetch(`${apiBase}/bookings/${booking.id}/confirm`, { method: "POST" });
    setReviewing(false);
    if (res.ok) {
      setReviewingBooking(null);
      loadSlots();
      loadPendingBookings();
    } else {
      const data = await res.json();
      setReviewMessage(data.error || "Something went wrong.");
    }
  }

  async function denyBooking(booking: Booking) {
    setReviewing(true);
    const res = await fetch(`${apiBase}/bookings/${booking.id}/deny`, { method: "POST" });
    const data = await res.json();
    setReviewing(false);
    if (res.ok) {
      setReviewingBooking(null);
      loadSlots();
      loadPendingBookings();
      if (data.refundNeeded) {
        setReviewMessage("Denied — this was a paid booking, so remember to refund the player outside the app.");
      }
    } else {
      setReviewMessage(data.error || "Something went wrong.");
    }
  }

  async function openNoteFor(slot: Slot) {
    setNoteSlot(slot);
    // Find the booking tied to this slot to load/save its note.
    const res = await fetch(`${apiBase}/bookings`);
    const bookings = await res.json();
    const match = bookings.find((b: any) => b.availabilityId === slot.id || b.startTime === slot.startTime);
    if (match) {
      setBookingId(match.id);
      setNoteText(match.note?.text || "");
      setBookingContact({
        name: match.contactName || match.player?.name || "—",
        phone: match.contactPhone || "—",
        email: match.contactEmail || match.player?.email || "—",
        handedness: match.player?.handedness || null,
        scoreOrHandicap: match.player?.scoreOrHandicap || null,
        commonIssues: match.player?.commonIssues || null,
        instructorName: match.instructor?.user.name || null,
      });
    } else {
      setBookingId(null);
      setNoteText("");
      setBookingContact(null);
    }
  }

  async function saveNote() {
    if (!bookingId) return;
    await fetch(`${apiBase}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, text: noteText }),
    });
    setNoteSlot(null);
  }

  const slotsByKey = useMemo(() => {
    const map: Record<string, Slot> = {};
    for (const s of slots) map[s.startTime] = s;
    return map;
  }, [slots]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="mono" style={{ fontSize: 12, letterSpacing: "0.1em", color: "var(--gold)" }}>
              INSTRUCTOR
            </span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <a href={`${basePath}/customers`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Customers</a>
              <a href={`${basePath}/instructor/videos`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Swing videos</a>
              <a href={`${basePath}/instructor/swing-sketch`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Swing Sketch</a>
              <a href={`${basePath}/instructor/shop`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Shop</a>
              <a href={`${basePath}/settings`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>Settings</a>
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>
                Sign out
              </button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h1 className="display" style={{ fontSize: 26, margin: 0 }}>Availability</h1>
            {pendingBookings.length > 0 && (
              <span style={{
                background: "var(--gold)", color: "var(--fairway)", fontSize: 11, fontWeight: 800,
                borderRadius: 10, padding: "2px 8px",
              }}>
                {pendingBookings.length} pending
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#9DB8A9", margin: "0 0 14px" }}>
            {teamInstructors.length > 1 ? "Each instructor has their own calendar." : "You can only run a lesson or a fitting at a given time, not both."}
          </p>

          {teamInstructors.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {teamInstructors.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setViewingInstructorId(t.id)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    border: viewingInstructorId === t.id ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.2)",
                    background: viewingInstructorId === t.id ? "rgba(184,134,43,0.18)" : "transparent",
                    color: "var(--chalk)",
                  }}
                >
                  {t.id === viewerMembershipId ? "My calendar" : t.name || t.email}
                </button>
              ))}
            </div>
          )}

          {!calendarConnected && (
            <a href={`${apiBase}/calendar/${calendarProvider === "outlook" ? "outlook/" : ""}connect`} style={{
              display: "inline-block", background: "var(--gold)", color: "var(--fairway)", fontWeight: 700,
              fontSize: 13, padding: "8px 14px", borderRadius: 8, textDecoration: "none", marginBottom: 14,
            }}>
              Connect {calendarProvider === "outlook" ? "Outlook" : "Google"} Calendar
            </a>
          )}

          {calendarConnected && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={runSync} disabled={syncing} style={{
                  background: "var(--gold)", color: "var(--fairway)", border: "none", borderRadius: 8,
                  fontWeight: 700, fontSize: 13, padding: "8px 14px",
                }}>
                  {syncing ? "Syncing…" : "Sync with Google Calendar"}
                </button>
                <button onClick={() => setShowSyncLog((s) => !s)} style={{
                  background: "transparent", color: "#D7DED9", border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 8, fontSize: 13, padding: "8px 14px", fontWeight: 600,
                }}>
                  {showSyncLog ? "Hide" : "View"} sync history
                </button>
              </div>
              {syncMessage && (
                <div className="mono" style={{ fontSize: 11, color: "#D7DED9", marginTop: 8 }}>{syncMessage}</div>
              )}
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
        {showSyncLog && (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "10px 16px", background: "#EFEBDD", fontSize: 13, fontWeight: 700 }}>
              Recent sync activity
            </div>
            {syncLogs.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--faint)", padding: 16, margin: 0 }}>No syncs yet.</p>
            ) : (
              syncLogs.map((log, idx) => (
                <div key={log.id} style={{
                  padding: "10px 16px", borderTop: idx === 0 ? "none" : "1px solid #EFEBDD",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: log.success ? "var(--ink)" : "#B23A3A" }}>
                      {log.success
                        ? `${log.bookingsCreated} booked · ${log.slotsBlocked} blocked · ${log.slotsUnblocked} reopened`
                        : log.message || "Sync failed"}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                      {new Date(log.ranAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {" · "}{log.triggeredBy}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          Tap a slot to open or close it. Tap a booked slot to add or edit a note.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "var(--faint)", fontWeight: 600 }}>Powered by</span>
          <img src="/ping-logo.png" alt="PING" style={{ height: 24, width: "auto", flexShrink: 0 }} />
        </div>

        <button
          onClick={() => { setNewBookingOpen((o) => !o); setNewBookingError(null); }}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "var(--fairway)", color: "var(--chalk)",
            border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, marginBottom: 20,
          }}
        >
          + New booking
        </button>

        {newBookingOpen && (() => {
          const openSlots = slots.filter((s) => s.status === "open");
          const selectedPlayer = players.find((p) => p.id === newBookingForm.playerId);
          return (
            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New booking</div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {teamInstructors.length > 1 && (
                  <label>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Instructor</div>
                    <select
                      value={newBookingForm.instructorMembershipId}
                      onChange={(e) => {
                        setNewBookingForm((f) => ({ ...f, instructorMembershipId: e.target.value, slotId: "" }));
                        if (e.target.value) setViewingInstructorId(e.target.value);
                      }}
                      style={selectStyle}
                    >
                      <option value="">Choose an instructor…</option>
                      {teamInstructors.map((t) => (
                        <option key={t.id} value={t.id}>{t.name || t.email}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Time slot (this week)</div>
                  <select
                    value={newBookingForm.slotId}
                    onChange={(e) => setNewBookingForm((f) => ({ ...f, slotId: e.target.value }))}
                    style={selectStyle}
                  >
                    <option value="">Choose a slot…</option>
                    {openSlots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.startTime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Type</div>
                  <select
                    value={newBookingForm.serviceType === "fitting" ? `fitting-${newBookingForm.fittingType}` : (newBookingForm.isRemote ? "lesson-remote" : "lesson")}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "lesson") setNewBookingForm((f) => ({ ...f, serviceType: "lesson", isRemote: false, packageId: "" }));
                      else if (v === "lesson-remote") setNewBookingForm((f) => ({ ...f, serviceType: "lesson", isRemote: true, packageId: "" }));
                      else setNewBookingForm((f) => ({ ...f, serviceType: "fitting", fittingType: v.replace("fitting-", ""), packageId: "" }));
                    }}
                    style={selectStyle}
                  >
                    <option value="lesson">Lesson</option>
                    {remoteLessonsEnabled && <option value="lesson-remote">Lesson — remote (video call)</option>}
                    <option value="fitting-driver">Driver fitting</option>
                    <option value="fitting-iron">Iron fitting</option>
                    <option value="fitting-full">Full bag fitting</option>
                  </select>
                </label>

                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Player</div>
                  <select
                    value={newBookingForm.playerId}
                    onChange={(e) => setNewBookingForm((f) => ({ ...f, playerId: e.target.value, packageId: "" }))}
                    style={selectStyle}
                  >
                    <option value="">Choose a player…</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.name || p.email}</option>
                    ))}
                  </select>
                  {players.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>
                      No players yet — someone needs to sign in and book once before they'll show up here.
                    </div>
                  )}
                </label>

                {newBookingForm.serviceType === "lesson" && selectedPlayer && (
                  <label>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
                      Package (optional — leave blank for a free-standing booking, e.g. pay in person)
                    </div>
                    <select
                      value={newBookingForm.packageId}
                      onChange={(e) => setNewBookingForm((f) => ({ ...f, packageId: e.target.value }))}
                      style={selectStyle}
                    >
                      <option value="">No package — free-standing booking</option>
                      {selectedPlayer.packages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.label} ({pkg.lessonsRemaining} of {pkg.lessonsTotal} left)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {newBookingError && <p style={{ fontSize: 12, color: "#B23A3A", margin: 0 }}>{newBookingError}</p>}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setNewBookingOpen(false)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                    Cancel
                  </button>
                  <button
                    onClick={createManualBooking}
                    disabled={creatingBooking}
                    style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}
                  >
                    {creatingBooking ? "Booking…" : "Create booking"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {pendingBookings.length > 0 && (
          <div style={{ background: "#FBF3DE", border: "1px solid #E3CE93", borderRadius: 12, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#9A7A1E", marginBottom: 10 }}>
              {pendingBookings.length} pending request{pendingBookings.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingBookings.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setReviewingBooking(b); setReviewMessage(null); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "#FFF", border: "1px solid #E3CE93", borderRadius: 8,
                    padding: "8px 12px", textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{b.contactName || b.player?.name || "—"}</div>
                    <div className="mono" style={{ fontSize: 11, color: "#8A8571" }}>
                      {b.serviceType === "fitting" ? "Fitting" : "Lesson"} ·{" "}
                      {new Date(b.startTime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {b.instructor?.user.name && ` · with ${b.instructor.user.name}`}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "#9A7A1E", fontWeight: 700 }}>Review →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
            {new Date(weekStart.getTime() + 6 * DAY_MS).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))} style={navBtnStyle}>←</button>
            <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))} style={navBtnStyle}>→</button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading…</p>
        ) : (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            {Array.from({ length: 7 }).map((_, dayIdx) => {
              const dayDate = new Date(weekStart.getTime() + dayIdx * DAY_MS);
              return (
                <div key={dayIdx} style={{ borderTop: dayIdx === 0 ? "none" : "1px solid #EFEBDD", padding: "10px 14px" }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                    {dayDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {TIMES.map((time) => {
                      const [h, m] = time.split(":").map(Number);
                      const dt = new Date(dayDate);
                      dt.setHours(h, m, 0, 0);
                      const key = dt.toISOString();
                      const slot = slotsByKey[key];
                      if (!slot) return null;

                      let bg = "var(--closed)";
                      let color = "var(--ink)";
                      let border = "none";
                      if (slot.status === "open") {
                        bg = "var(--open)";
                      } else if (slot.status === "pending") {
                        bg = "#FBF3DE";
                        border = "1px dashed #B8862B";
                      } else if (slot.status === "booked") {
                        bg = slot.bookedServiceType === "fitting"
                          ? "#B8862B"
                          : slot.bookedIsRemote
                          ? "var(--remote)"
                          : "var(--fairway)";
                        color = "var(--chalk)";
                      }

                      return (
                        <button key={time} onClick={() => toggleSlot(slot)} style={{
                          padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, border,
                          background: bg, color,
                        }}>
                          {slot.status === "pending" ? "⏳" : formatTime12h(time)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          <Legend color="var(--open)" label="Open" />
          <Legend color="var(--closed)" label="Closed" />
          <Legend color="#FBF3DE" label="Pending request" />
          <Legend color="var(--fairway)" label="Lesson booked" />
          <Legend color="var(--remote)" label="Remote lesson booked" />
          <Legend color="#B8862B" label="Fitting booked" />
        </div>

        {reviewingBooking && (
          <div ref={reviewPanelRef} style={{ background: "#FFF", border: "1px solid #B8862B", borderRadius: 12, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              Pending {reviewingBooking.serviceType === "fitting" ? "fitting" : "lesson"} request
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 10 }}>
              {new Date(reviewingBooking.startTime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {reviewingBooking.priceCents > 0 && ` · ${(reviewingBooking.priceCents / 100).toFixed(0)} paid`}
              {reviewingBooking.instructor?.user.name && ` · with ${reviewingBooking.instructor.user.name}`}
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
              background: "var(--card)", border: "1px solid var(--border)", marginBottom: 14,
            }}>
              <User size={14} color="var(--fairway)" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{reviewingBooking.contactName || reviewingBooking.player?.name || "—"}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {reviewingBooking.contactPhone || "—"} · {reviewingBooking.contactEmail || reviewingBooking.player?.email || "—"}
                </div>
              </div>
            </div>
            {(reviewingBooking.player?.handedness || reviewingBooking.player?.scoreOrHandicap || reviewingBooking.player?.commonIssues) && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, background: "#FBF3DE", border: "1px solid #E3CE93", marginBottom: 14,
              }}>
                <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#9A7A1E", letterSpacing: "0.04em", marginBottom: 6 }}>
                  GOLF PROFILE
                </div>
                {(reviewingBooking.player?.handedness || reviewingBooking.player?.scoreOrHandicap) && (
                  <div style={{ fontSize: 12, marginBottom: reviewingBooking.player?.commonIssues ? 4 : 0 }}>
                    {reviewingBooking.player?.handedness && (
                      <span style={{ textTransform: "capitalize" }}>{reviewingBooking.player.handedness}-handed</span>
                    )}
                    {reviewingBooking.player?.handedness && reviewingBooking.player?.scoreOrHandicap && " · "}
                    {reviewingBooking.player?.scoreOrHandicap}
                  </div>
                )}
                {reviewingBooking.player?.commonIssues && (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{reviewingBooking.player.commonIssues}</div>
                )}
              </div>
            )}
            {reviewMessage && (
              <p style={{ fontSize: 12, color: "#B23A3A", marginBottom: 10 }}>{reviewMessage}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => denyBooking(reviewingBooking)}
                disabled={reviewing}
                style={{
                  flex: 1, background: "#FFF", color: "#B23A3A", border: "1px solid #E8C9C9",
                  borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700,
                }}
              >
                Deny
              </button>
              <button
                onClick={() => confirmBooking(reviewingBooking)}
                disabled={reviewing}
                style={{
                  flex: 1, background: "var(--fairway)", color: "var(--chalk)", border: "none",
                  borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700,
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {noteSlot && (
          <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
              Note for {new Date(noteSlot.startTime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
            {bookingId ? (
              <>
                {bookingContact && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                    background: "var(--card)", border: "1px solid var(--border)", marginBottom: 12,
                  }}>
                    <User size={14} color="var(--fairway)" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{bookingContact.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                        {bookingContact.phone} · {bookingContact.email}
                        {bookingContact.instructorName && ` · with ${bookingContact.instructorName}`}
                      </div>
                    </div>
                  </div>
                )}
                {bookingContact && (bookingContact.handedness || bookingContact.scoreOrHandicap || bookingContact.commonIssues) && (
                  <div style={{
                    padding: "10px 12px", borderRadius: 8, background: "#FBF3DE", border: "1px solid #E3CE93", marginBottom: 12,
                  }}>
                    <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#9A7A1E", letterSpacing: "0.04em", marginBottom: 6 }}>
                      GOLF PROFILE
                    </div>
                    {(bookingContact.handedness || bookingContact.scoreOrHandicap) && (
                      <div style={{ fontSize: 12, marginBottom: bookingContact.commonIssues ? 4 : 0 }}>
                        {bookingContact.handedness && (
                          <span style={{ textTransform: "capitalize" }}>{bookingContact.handedness}-handed</span>
                        )}
                        {bookingContact.handedness && bookingContact.scoreOrHandicap && " · "}
                        {bookingContact.scoreOrHandicap}
                      </div>
                    )}
                    {bookingContact.commonIssues && (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{bookingContact.commonIssues}</div>
                    )}
                  </div>
                )}
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  placeholder="e.g. Focus on grip and takeaway, bring wedges next time"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontFamily: "inherit", fontSize: 13, marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setNoteSlot(null)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                    Cancel
                  </button>
                  <button onClick={saveNote} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>
                    Save note
                  </button>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Couldn't find the booking for this slot.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: 4, background: color }} />
      {label}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  border: "1px solid var(--border)", background: "#FFF", borderRadius: 8, padding: "6px 12px", fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px",
  fontFamily: "inherit", fontSize: 13, background: "#FFF",
};

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}
