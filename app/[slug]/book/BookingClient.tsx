"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { FITTING_TYPES, centsToDollars, enabledPackages, enabledFittings, getFittingPriceCents } from "@/lib/pricing";
import { formatTime12h, wallClockToUTC } from "@/lib/time";

const TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const DAY_MS = 24 * 60 * 60 * 1000;

type Slot = { id: string; startTime: string; status: string; bookedServiceType: string | null; bookedIsRemote?: boolean };
type Package = { id: string; type: string; lessonsRemaining: number; lessonsTotal: number; paymentStatus?: string; instructorMembershipId?: string | null };
type Instructor = { id: string; name: string | null; email: string; image: string | null; role: string; [key: string]: any };

export default function BookingClient({
  initialPackages,
  business,
  remoteLessonsEnabled,
  slug,
  basePath,
  apiBase,
}: {
  initialPackages: Package[];
  business: { name: string; email: string; lessonRate: string; [key: string]: any };
  remoteLessonsEnabled: boolean;
  slug: string;
  basePath: string;
  apiBase: string;
}) {
  const [service, setService] = useState<"lesson" | "fitting">("lesson");
  const [isRemote, setIsRemote] = useState(false);
  const [packages, setPackages] = useState<Package[]>(initialPackages);
  // Which package is auto/selected depends on which instructor is chosen
  // (pricing and ownership are both per-instructor now) — set once
  // instructors load, see the effect below, rather than at mount.
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  // A package the player has chosen to BUY but hasn't paid for yet — distinct
  // from selectedPackageId, which is an already-owned package with credits.
  // Having either one set is what lets them pick a day/time; the "Confirm"
  // button then either books directly (owned) or sends them to pay (pending),
  // with the specific slot they picked carried through to checkout so it's
  // reserved for them at the moment they pay, not before and not after.
  const [pendingPackageType, setPendingPackageType] = useState<string | null>(null);
  const [fittingType, setFittingType] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Slot | null>(null);
  const confirmCardRef = useRef<HTMLDivElement>(null);

  // Picking a time slot is easy to miss following up on if the confirm card
  // is off-screen below the calendar — scroll it into view automatically so
  // there's no chance of "I picked a time but nothing happened."
  useEffect(() => {
    if (selected && confirmCardRef.current) {
      confirmCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<{
    id: string; serviceType: string; fittingType: string | null; startTime: string;
    status: string; isRemote: boolean; videoCallUrl: string | null; instructorName: string | null;
  }[]>([]);

  function loadMyBookings() {
    fetch(`${apiBase}/bookings/mine`)
      .then((r) => r.json())
      .then((list) => setMyBookings(Array.isArray(list) ? list : []))
      .catch(() => {});
  }

  useEffect(() => {
    loadMyBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`${apiBase}/instructors`)
      .then((r) => r.json())
      .then((list: Instructor[]) => {
        setInstructors(list);
        // Most businesses have exactly one instructor — don't make players
        // click through a picker with only one option in it.
        if (list.length === 1) setSelectedInstructorId(list[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Packages are tied to a specific instructor (pricing is per-instructor),
  // so switching who you're booking with should surface whatever you
  // already own *with them* — not a package bought from someone else.
  useEffect(() => {
    if (!selectedInstructorId) {
      setSelectedPackageId(null);
      return;
    }
    const owned = packages.find((p) => p.instructorMembershipId === selectedInstructorId && p.lessonsRemaining > 0);
    setSelectedPackageId(owned?.id || null);
    setPendingPackageType(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstructorId]);

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function contactValid() {
    return contact.name.trim().length > 0 && contact.phone.trim().length > 0 && isValidEmail(contact.email);
  }

  useEffect(() => {
    if (selectedInstructorId) loadSlots();
    else setSlots([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, weekStart, selectedInstructorId]);

  async function loadSlots() {
    if (!selectedInstructorId) return;
    setLoading(true);
    const start = weekStart.toISOString();
    const end = new Date(weekStart.getTime() + 7 * DAY_MS).toISOString();
    const res = await fetch(`${apiBase}/availability?start=${start}&end=${end}&instructorMembershipId=${selectedInstructorId}`);
    const data = await res.json();
    setSlots(data);
    setLoading(false);
  }

  function choosePackageToBuy(packageType: string) {
    setPendingPackageType(packageType);
    setSelectedPackageId(null);
  }

  function chooseOwnedPackage(packageId: string) {
    setSelectedPackageId(packageId);
    setPendingPackageType(null);
  }

  async function payLaterPackage(packageType: string) {
    if (!selectedInstructorId) return;
    const res = await fetch(`${apiBase}/packages/pay-later`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageType, instructorMembershipId: selectedInstructorId }),
    });
    const data = await res.json();
    if (res.ok) {
      setPackages((prev) => [...prev, data]);
      chooseOwnedPackage(data.id);
    } else {
      setMessage(data.error || "Something went wrong.");
    }
  }

  // Books directly against an already-owned package — no payment involved.
  async function bookLesson() {
    if (!selected || !selectedPackage || !selectedInstructorId || !contactValid()) return;
    setConfirming(true);
    const res = await fetch(`${apiBase}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availabilityId: selected.id,
        packageId: selectedPackage.id,
        instructorMembershipId: selectedInstructorId,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email,
        isRemote,
      }),
    });
    setConfirming(false);
    if (res.ok) {
      const created = await res.json();
      setMessage(
        created.status === "pending"
          ? "Request sent — this time is held for you. You'll be confirmed shortly."
          : created.videoCallUrl
          ? "Lesson booked — your video call link is ready below."
          : "Lesson booked and synced to the calendar."
      );
      setSelected(null);
      setPackages((prev) => prev.map((p) => (p.id === selectedPackageId ? { ...p, lessonsRemaining: p.lessonsRemaining - 1 } : p)));
      loadSlots();
      loadMyBookings();
    } else {
      const err = await res.json();
      setMessage(err.error || "Something went wrong.");
    }
  }

  // Buying a brand new package for a specific slot — the slot comes along in
  // checkout metadata, so paying both purchases the package AND books that
  // slot with the first credit, all in one step (see the webhook).
  async function buyPackageAndBookSlot() {
    if (!selected || !pendingPackageType || !selectedInstructorId || !contactValid()) return;
    setConfirming(true);
    const res = await fetch(`${apiBase}/packages/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageType: pendingPackageType,
        availabilityId: selected.id,
        instructorMembershipId: selectedInstructorId,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email,
        isRemote,
      }),
    });
    setConfirming(false);
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setMessage(data.error || "Something went wrong.");
  }

  async function bookFitting() {
    if (!selected || !fittingType || !selectedInstructorId || !contactValid()) return;
    setConfirming(true);
    const res = await fetch(`${apiBase}/fittings/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availabilityId: selected.id,
        fittingType,
        instructorMembershipId: selectedInstructorId,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email,
      }),
    });
    setConfirming(false);
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setMessage(data.error || "Something went wrong.");
  }

  const slotsByKey = useMemo(() => {
    const map: Record<string, Slot> = {};
    for (const s of slots) map[s.startTime] = s;
    return map;
  }, [slots]);

  const selectedInstructor = instructors.find((i) => i.id === selectedInstructorId) || null;
  const selectedPackage = packages.find((p) => p.id === selectedPackageId) || null;
  // A "Video lesson" package is pointless to show if the business never
  // configured Daily.co — the booking would go through but never get a
  // working call link, which is a worse experience than just not offering
  // it. Computed once and reused everywhere the package list renders.
  function visiblePackages(inst: any) {
    const list = enabledPackages(inst || {});
    return remoteLessonsEnabled ? list : list.filter((p) => p.id !== "video");
  }

  const pendingPackageInfo = pendingPackageType && selectedInstructor ? visiblePackages(selectedInstructor).find((p) => p.id === pendingPackageType) || null : null;

  // The "Video lesson" package is inherently remote — no need to also flip
  // a separate toggle for it. Any other package still goes through the
  // toggle normally (a player can take a regular lesson remotely too).
  const isVideoPackage = selectedPackage?.type === "video" || pendingPackageType === "video";
  useEffect(() => {
    if (isVideoPackage) setIsRemote(true);
  }, [isVideoPackage]);
  const activeFitting = fittingType && selectedInstructor
    ? { ...FITTING_TYPES.find((f) => f.id === fittingType)!, priceCents: getFittingPriceCents(selectedInstructor, fittingType) }
    : null;
  // Either an owned package with credits, or a tier chosen to buy — either is enough to pick a slot, but only once an instructor is chosen too.
  const canPickLessonSlot = !!selectedInstructorId && ((!!selectedPackage && selectedPackage.lessonsRemaining > 0) || !!pendingPackageType);
  const isBuyingPackage = !selectedPackage && !!pendingPackageType;

  useEffect(() => {
    if (fittingType && selectedInstructor) {
      const list = enabledFittings(selectedInstructor);
      if (!list.find((f) => f.id === fittingType)) {
        setFittingType(list[0]?.id || null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstructor]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <span className="display" style={{ fontSize: 18, fontWeight: 700, color: "var(--chalk)" }}>
              {business.name}
            </span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={`${basePath}/videos`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                Swing videos
              </a>
              <a href={`${basePath}/swing-sketches`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                Swing Sketches
              </a>
              <a href={`${basePath}/shop`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                Shop
              </a>
              <a href={`${basePath}/gift-cards`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                Gift Cards
              </a>
              <a href={`${basePath}/settings`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                Settings
              </a>
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ background: "none", border: "none", color: "#D7DED9", fontSize: 13 }}>
                Sign out
              </button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 26, margin: "0 0 4px" }}>
            {service === "lesson" ? "Book a lesson" : "Book a club fitting"}
          </h1>
          {business.instructorName && (
            <p style={{ fontSize: 16, fontWeight: 600, color: "#D7DED9", margin: "0 0 14px" }}>
              with {business.instructorName}
            </p>
          )}

          {instructors.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "#9DB8A9", marginBottom: 8, letterSpacing: "0.04em" }}>
                WHO WOULD YOU LIKE TO BOOK WITH?
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {instructors.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => { setSelectedInstructorId(inst.id); setSelected(null); }}
                    style={{
                      padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: "left",
                      border: selectedInstructorId === inst.id ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.2)",
                      background: selectedInstructorId === inst.id ? "rgba(184,134,43,0.18)" : "var(--chalk)",
                      color: selectedInstructorId === inst.id ? "var(--chalk)" : "var(--fairway)",
                    }}
                  >
                    <div style={{ color: selectedInstructorId === inst.id ? "var(--chalk)" : "var(--fairway)" }}>
                      {inst.name || inst.email}
                    </div>
                    {inst.specialty && (
                      <div className="mono" style={{
                        fontSize: 10, fontWeight: 600, marginTop: 2,
                        color: selectedInstructorId === inst.id ? "rgba(246,244,238,0.75)" : "var(--faint)",
                      }}>
                        {inst.specialty}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {instructors.length > 1 && !selectedInstructorId ? (
            <p style={{ fontSize: 13, color: "#D7DED9", margin: "4px 0 0" }}>
              Choose an instructor above to see their lesson and fitting pricing.
            </p>
          ) : (
            <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {(["lesson", "fitting"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setService(s); setSelected(null); }}
                style={{
                  padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                  border: service === s ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.2)",
                  background: service === s ? "rgba(184,134,43,0.18)" : "transparent",
                  color: "var(--chalk)",
                }}
              >
                {s === "lesson" ? "Lesson" : "Club fitting"}
              </button>
            ))}
          </div>

          {service === "lesson" && remoteLessonsEnabled && !isVideoPackage && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {([false, true] as const).map((remote) => (
                <button
                  key={String(remote)}
                  onClick={() => setIsRemote(remote)}
                  style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: isRemote === remote ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.2)",
                    background: isRemote === remote ? "rgba(184,134,43,0.18)" : "transparent",
                    color: "var(--chalk)",
                  }}
                >
                  {remote ? "Remote (video call)" : "In-person"}
                </button>
              ))}
            </div>
          )}
          {service === "lesson" && isVideoPackage && (
            <p className="mono" style={{ fontSize: 11, color: "#9DB8A9", marginBottom: 14 }}>
              This is a remote lesson — you'll get a video call link once it's confirmed.
            </p>
          )}

          {service === "lesson" && (
            <div>
              {(selectedPackage || pendingPackageInfo) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <button
                    onClick={() => {
                      setSelectedPackageId(null);
                      setPendingPackageType(null);
                      setSelected(null);
                    }}
                    style={{
                      background: "var(--gold)", color: "var(--fairway)", border: "1px solid var(--gold)",
                      borderRadius: 10, padding: "10px 14px", textAlign: "left", minWidth: 108,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {selectedPackage ? selectedPackage.type : pendingPackageInfo!.label}
                    </div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                      {selectedPackage
                        ? `${selectedPackage.lessonsRemaining} of ${selectedPackage.lessonsTotal} left${selectedPackage.paymentStatus === "pending" ? " · pay at lesson" : ""}`
                        : `${centsToDollars(pendingPackageInfo!.priceCents)} · pick a time, then pay`}
                    </div>
                  </button>
                </div>
              )}
              <div>
                <div className="mono" style={{ fontSize: 11, color: "#9DB8A9", marginBottom: 8, letterSpacing: "0.04em" }}>
                  {selectedPackage || pendingPackageInfo ? "SWITCH PACKAGE" : packages.some((p) => p.lessonsRemaining > 0) ? "SELECT A PACKAGE" : "CHOOSE A PACKAGE TO GET STARTED"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {visiblePackages(selectedInstructor || {}).length === 0 ? null : (
                    visiblePackages(selectedInstructor || {}).map((p) => {
                      const owned = packages.find((op) => op.type === p.id && op.instructorMembershipId === selectedInstructorId && op.lessonsRemaining > 0);
                      const isPriced = p.priceCents > 0;
                      return (
                        <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 108 }}>
                          <button
                            onClick={() => {
                              if (owned) chooseOwnedPackage(owned.id);
                              else if (isPriced) choosePackageToBuy(p.id);
                            }}
                            disabled={!owned && !isPriced}
                            style={{
                              background: "var(--chalk)", color: "var(--fairway)", border: "none", borderRadius: 10,
                              padding: "10px 14px", textAlign: "left", opacity: !owned && !isPriced ? 0.6 : 1,
                              cursor: !owned && !isPriced ? "default" : "pointer",
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</div>
                            <div className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>
                              {owned ? `${owned.lessonsRemaining} left` : isPriced ? centsToDollars(p.priceCents) : "TBD"}
                            </div>
                          </button>
                          {!owned && isPriced && business.allowPayLater && (
                            <button
                              onClick={() => payLaterPackage(p.id)}
                              style={{
                                background: "transparent", color: "#D7DED9", border: "1px dashed rgba(255,255,255,0.3)",
                                borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 600,
                              }}
                            >
                              Pay at first lesson
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {service === "fitting" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {enabledFittings(selectedInstructor || {}).length === 0 ? null : (
                enabledFittings(selectedInstructor || {}).map((f) => (
                  <button key={f.id} onClick={() => {
                    if (fittingType === f.id) {
                      setFittingType(null);
                      setSelected(null);
                    } else {
                      setFittingType(f.id);
                    }
                  }} style={{
                    background: fittingType === f.id ? "var(--gold)" : "var(--chalk)", color: "var(--fairway)",
                    border: "none", borderRadius: 10, padding: "10px 14px", textAlign: "left", minWidth: 108,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
                      {centsToDollars(f.priceCents)} · {f.durationMin} min
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
            </>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 20px 60px" }}>
        {message && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
            {message}{" "}
            <button onClick={() => setMessage(null)} style={{ background: "none", border: "none", color: "var(--gold)", fontWeight: 600, fontSize: 13 }}>
              Dismiss
            </button>
          </div>
        )}

        {myBookings.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: 8, letterSpacing: "0.04em" }}>
              YOUR UPCOMING SESSIONS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {myBookings.map((b) => (
                <div key={b.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {b.serviceType === "fitting" ? "Club fitting" : b.isRemote ? "Remote lesson" : "Lesson"}
                        {b.instructorName ? ` with ${b.instructorName}` : ""}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                        {new Date(b.startTime).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    {b.status === "pending" && (
                      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#9A7A1E", background: "#FBF3DE", borderRadius: 4, padding: "3px 6px" }}>
                        PENDING
                      </span>
                    )}
                  </div>
                  {b.isRemote && (
                    b.videoCallUrl ? (
                      <a
                        href={b.videoCallUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-block", marginTop: 8, background: "var(--fairway)", color: "var(--chalk)",
                          fontWeight: 700, fontSize: 12, padding: "6px 12px", borderRadius: 6, textDecoration: "none",
                        }}
                      >
                        Join video call
                      </a>
                    ) : (
                      <p style={{ fontSize: 11, color: "var(--faint)", margin: "6px 0 0" }}>
                        Video call link will appear here once this is confirmed.
                      </p>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "var(--faint)", fontWeight: 600 }}>Powered by</span>
          <a
            href="https://pinggolf.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", padding: "4px 10px",
              border: "1px solid var(--border)", borderRadius: 8, background: "#FFF",
              textDecoration: "none", lineHeight: 0,
            }}
          >
            <img src="/ping-logo.png" alt="PING" style={{ height: 24, width: "auto", flexShrink: 0 }} />
          </a>
        </div>

        {service === "lesson" ? (
          (selectedPackage || pendingPackageInfo) && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
              background: selectedPackage?.paymentStatus === "pending" || isBuyingPackage ? "#FBF3DE" : "var(--open)",
              border: `1px solid ${selectedPackage?.paymentStatus === "pending" || isBuyingPackage ? "#E3CE93" : "var(--border)"}`,
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {isBuyingPackage ? (
                  <>
                    Buying: <span style={{ color: "var(--gold)" }}>{pendingPackageInfo!.label}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}> · {centsToDollars(pendingPackageInfo!.priceCents)}</span>
                  </>
                ) : (
                  <>
                    Booking from: <span style={{ color: "var(--gold)" }}>{selectedPackage!.type}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}> · {selectedPackage!.lessonsRemaining} of {selectedPackage!.lessonsTotal} left</span>
                    {selectedPackage!.paymentStatus === "pending" && (
                      <span className="mono" style={{ color: "#9A7A1E", fontWeight: 600 }}> · payment due at first lesson</span>
                    )}
                  </>
                )}
              </span>
            </div>
          )
        ) : (
          activeFitting && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
              background: "var(--open)", border: "1px solid var(--border)", marginBottom: 14,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Booking from: <span style={{ color: "var(--gold)" }}>{activeFitting.label}</span>
                <span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}> · {centsToDollars(activeFitting.priceCents)} · {activeFitting.durationMin} min</span>
              </span>
            </div>
          )
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
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading availability…</p>
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
                      const dt = wallClockToUTC(dayDate, h, m);                      
                      const key = dt.toISOString();
                      const slot = slotsByKey[key];
                      if (!slot) return null;
                      const isOpen = slot.status === "open";
                      const isBooked = slot.status === "booked";
                      const isPending = slot.status === "pending";
                      const isSelected = selected?.id === slot.id;
                      const canPick = isOpen && (service === "lesson" ? canPickLessonSlot : !!fittingType && !!selectedInstructorId);
                      const bookedBg = slot.bookedServiceType === "fitting"
                        ? "#B8862B"
                        : slot.bookedIsRemote
                        ? "var(--remote)"
                        : "var(--fairway)";
                      return (
                        <button
                          key={time}
                          disabled={!canPick}
                          onClick={() => setSelected(slot)}
                          style={{
                            padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: isPending ? "1px dashed #B8862B" : "none",
                            background: isSelected ? "var(--gold)" : canPick ? "var(--open)" : isBooked ? bookedBg : isPending ? "#FBF3DE" : "var(--closed)",
                            color: isSelected ? "#FFF" : isBooked ? "var(--chalk)" : "var(--ink)",
                            cursor: canPick ? "pointer" : "default",
                          }}
                        >
                          {isPending ? "⏳" : formatTime12h(time)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected && (
          <div
            ref={confirmCardRef}
            style={{
              marginTop: 20, background: "var(--fairway)", borderRadius: 12, padding: "18px 18px 16px",
              border: "2px solid var(--gold)", boxShadow: "0 4px 20px rgba(184,134,43,0.35)",
            }}
          >
            <div className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 8 }}>
              ENTER YOUR INFO TO {service === "lesson" && !isBuyingPackage ? "CONFIRM" : "PAY"}
            </div>
            <div style={{ color: "var(--chalk)", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {new Date(selected.startTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at{" "}
                {new Date(selected.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "#9DB8A9" }}>
                {service === "lesson"
                  ? isBuyingPackage
                    ? `${pendingPackageInfo!.label} · ${centsToDollars(pendingPackageInfo!.priceCents)}`
                    : `Uses 1 of ${selectedPackage?.lessonsRemaining ?? 0} remaining`
                  : activeFitting ? `${activeFitting.label} · ${centsToDollars(activeFitting.priceCents)}` : ""}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <input
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                className="contact-input"
                placeholder="Full name"
                style={contactInputStyle}
              />
              <input
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                className="contact-input"
                placeholder="Phone number"
                type="tel"
                style={contactInputStyle}
              />
              <input
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                className="contact-input"
                placeholder="Email address"
                type="email"
                style={contactInputStyle}
              />
            </div>

            <button
              onClick={service === "lesson" ? (isBuyingPackage ? buyPackageAndBookSlot : bookLesson) : bookFitting}
              disabled={confirming || !contactValid() || !selectedInstructorId || (service === "lesson" && !canPickLessonSlot)}
              style={{
                width: "100%", background: "var(--gold)", color: "var(--fairway)", border: "none", borderRadius: 8,
                padding: "10px 18px", fontWeight: 700, fontSize: 14,
                opacity: confirming || !contactValid() || !selectedInstructorId || (service === "lesson" && !canPickLessonSlot) ? 0.6 : 1,
              }}
            >
              {confirming ? "…" : service === "lesson" && !isBuyingPackage ? "Confirm" : "Pay & Confirm"}
            </button>
          </div>
        )}

        {business.email && (
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--faint)", marginTop: 32 }}>
            Questions? Email <a href={`mailto:${business.email}`} style={{ color: "var(--gold)" }}>{business.email}</a>
          </p>
        )}
      </main>
    </div>
  );
}

const contactInputStyle: React.CSSProperties = {
  width: "100%", border: "none", borderRadius: 8, padding: "9px 12px",
  fontFamily: "inherit", fontSize: 13, background: "rgba(255,255,255,0.1)", color: "var(--chalk)",
};

const navBtnStyle: React.CSSProperties = {
  border: "1px solid var(--border)", background: "#FFF", borderRadius: 8, padding: "6px 12px", fontSize: 14,
};

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}
