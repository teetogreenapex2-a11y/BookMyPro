"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { FITTING_TYPES, centsToDollars, enabledPackages, enabledFittings, getFittingPriceCents } from "@/lib/pricing";
import { formatTime12h, wallClockToUTC } from "@/lib/time";

const DAY_MS = 24 * 60 * 60 * 1000;

type Slot = { id: string; startTime: string; status: string; bookedServiceType: string | null; bookedIsRemote?: boolean; allowLastMinute?: boolean; isGroup?: boolean; groupCapacity?: number | null; groupPriceCents?: number | null; groupSpotsTaken?: number; groupCategory?: string | null; groupAgeRange?: string | null };

function formatGroupCategory(category?: string | null, ageRange?: string | null) {
  const labels: Record<string, string> = { men: "Men", ladies: "Ladies", junior_younger: "Junior (Younger)", junior_older: "Junior (Older)" };
  if (!category) return null;
  const label = labels[category] || category;
  return ageRange ? `${label} - ${ageRange}` : label;
}
type Package = { id: string; type: string; lessonsRemaining: number; rawLessonsRemaining?: number; lessonsTotal: number; paymentStatus?: string; balanceDueCents?: number; instructorMembershipId?: string | null };
type Instructor = { id: string; name: string | null; email: string; image: string | null; role: string; [key: string]: any };

// A real, well-known iOS timing issue: Apple's own push token takes a
// moment to arrive asynchronously after permission is granted, and
// asking Firebase for its own token before that arrives fails with "No
// APNS token specified" - retrying a few times with a short wait, rather
// than asking once and giving up, is the standard, documented fix.
async function getFcmTokenWithRetry(FirebaseMessaging: any, attempts = 12, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await FirebaseMessaging.getToken();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

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
  // Built from the business's real, current hours instead of a fixed
  // list - without this, a business widening its hours in Settings would
  // never actually show any of those newly-added times to a player,
  // since this would still only ever be looking for its own fixed,
  // unrelated set of times regardless of what's actually available.
  const TIMES = useMemo(() => {
    const openHour = business.openHour ?? 8;
    const closeHour = business.closeHour ?? 17;
    const times: string[] = [];
    for (let h = openHour; h < closeHour; h++) times.push(`${String(h).padStart(2, "0")}:00`);
    return times;
  }, [business.openHour, business.closeHour]);

  const [service, setService] = useState<"lesson" | "fitting">("lesson");
  // Checking Capacitor.isNativePlatform() directly during render caused a
  // hydration mismatch elsewhere tonight (the server always renders as if
  // it's not native, since it has no way to know) - starting this state
  // at false to match the server, and only updating it after mounting on
  // the client, avoids that entirely.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);
  const [isRemote, setIsRemote] = useState(false);
  const [packages, setPackages] = useState<Package[]>(initialPackages);
  // Which package is auto/selected depends on which instructor is chosen
  // (pricing and ownership are both per-instructor now) - set once
  // instructors load, see the effect below, rather than at mount.
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  // A package the player has chosen to BUY but hasn't paid for yet - distinct
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
  const messageRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  // Scrolls the calendar into view once a package or fitting is chosen -
  // this used to happen somewhat by accident, just from how the old page
  // layout happened to lay out; making it explicit here so it keeps
  // working regardless of how much content ends up above the calendar.
  useEffect(() => {
    if ((selectedPackageId || pendingPackageType || fittingType) && calendarRef.current) {
      calendarRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedPackageId, pendingPackageType, fittingType]);

  // Picking a time slot is easy to miss following up on if the confirm card
  // is off-screen below the calendar - scroll it into view automatically so
  // there's no chance of "I picked a time but nothing happened."
  useEffect(() => {
    if (selected && confirmCardRef.current) {
      confirmCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Same reasoning as above, for the other half of the flow - a booking
  // that succeeds while the customer is scrolled down at the confirm
  // button shouldn't show its confirmation somewhere they can't see,
  // which is exactly what was happening before this.
  useEffect(() => {
    if (message && messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [message]);
  const [contact, setContact] = useState({ name: "", phone: "", email: "", handedness: "", scoreOrHandicap: "", commonIssues: "" });
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  const [upcomingGroups, setUpcomingGroups] = useState<
    { id: string; startTime: string; instructorMembershipId: string; instructorName: string; groupCapacity: number; groupPriceCents: number; groupSpotsTaken: number; groupCategory: string | null; groupAgeRange: string | null }[]
  >([]);
  const [groupFilter, setGroupFilter] = useState<"all" | "men" | "ladies" | "junior">("all");
  const [pushStatus, setPushStatus] = useState<"unknown" | "unsupported" | "off" | "on" | "enabling">("unknown");
  const [pushError, setPushError] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  useEffect(() => {
    function checkUnread() {
      fetch(`${apiBase}/conversations/unread-count`)
        .then((r) => r.json())
        .then((d) => setUnreadMessages(d.count || 0))
        .catch(() => {});
    }
    checkUnread();
    const interval = setInterval(checkUnread, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Permission being granted at the OS level doesn't guarantee a
      // token was ever actually saved to the backend - this was the
      // real, separate bug behind a specific tester's notifications
      // never arriving despite tapping "Allow": the app saw permission
      // was already granted and assumed everything was fine, without
      // ever re-checking whether a real token existed in the database.
      // Re-saving here every time the app opens is harmless if it's
      // already correct, and actually fixes the gap if it wasn't.
      import("@capacitor-firebase/messaging").then(async ({ FirebaseMessaging }) => {
        const { receive } = await FirebaseMessaging.checkPermissions();
        if (receive !== "granted") {
          setPushStatus("off");
          return;
        }
        try {
          const tokenResult = await getFcmTokenWithRetry(FirebaseMessaging); const token = tokenResult?.token;
          if (!token) {
            setPushStatus("off");
            return;
          }
          const saveRes = await fetch(`${apiBase}/push/fcm-subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          // Only claim success if the save genuinely succeeded - the
          // earlier version of this fix set "on" unconditionally even
          // when this failed, which hid the retry button completely
          // with no way to fix it or even see something was wrong.
          setPushStatus(saveRes.ok ? "on" : "off");
        } catch {
          setPushStatus("off");
        }
      });
      return;
    }
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) {
        setPushStatus("off");
        return;
      }
      reg.pushManager.getSubscription().then((sub) => setPushStatus(sub ? "on" : "off"));
    }).catch(() => setPushStatus("off"));
  }, []);

  async function enablePushNotifications() {
    setPushStatus("enabling");
    setPushError(null);
    try {
      // Native push (inside the wrapped app) uses Firebase Cloud
      // Messaging instead of the browser's own web push APIs below - a
      // completely different mechanism under the hood, but the same
      // end result for the person using it: a real device token gets
      // registered with the backend.
      if (Capacitor.isNativePlatform()) {
        const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
        const { receive } = await FirebaseMessaging.requestPermissions();
        if (receive !== "granted") {
          setPushStatus("off");
          setPushError(`Permission not granted (${receive})`);
          return;
        }
        const tokenResult = await getFcmTokenWithRetry(FirebaseMessaging); const token = tokenResult?.token;
        if (!token) {
          setPushStatus("off");
          setPushError("No device token was generated");
          return;
        }
        const saveRes = await fetch(`${apiBase}/push/fcm-subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!saveRes.ok) {
          // Permission was genuinely granted and a real token was
          // generated, but saving it to the backend failed - without
          // checking this, the UI would have claimed success anyway,
          // leaving the person thinking notifications were on when no
          // token was ever actually stored to send anything to.
          const text = await saveRes.text();
          console.error("Failed to save push token:", saveRes.status, text);
          setPushStatus("off");
          setPushError(`Save failed (${saveRes.status}): ${text.slice(0, 200)}`);
          return;
        }
        setPushStatus("on");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("off");
        setPushError(`Permission not granted (${permission})`);
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const saveRes = await fetch(`${apiBase}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saveRes.ok) {
        const text = await saveRes.text();
        console.error("Failed to save push subscription:", saveRes.status, text);
        setPushStatus("off");
        setPushError(`Save failed (${saveRes.status}): ${text.slice(0, 200)}`);
        return;
      }
      setPushStatus("on");
    } catch (err: any) {
      console.error("Failed to enable push notifications:", err);
      setPushStatus("off");
      setPushError(err?.message || String(err));
    }
  }

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
    fetch(`${apiBase}/groups`)
      .then((r) => r.json())
      .then((list) => setUpcomingGroups(Array.isArray(list) ? list : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`${apiBase}/instructors`)
      .then((r) => r.json())
      .then((list: Instructor[]) => {
        setInstructors(list);
        // Most businesses have exactly one instructor - don't make players
        // click through a picker with only one option in it.
        if (list.length === 1) {
          setSelectedInstructorId(list[0].id);
        } else if (list.length > 1) {
          // With more than one, prioritize whoever the player already
          // has a real, owned package with - a genuine customer hit
          // this directly: their existing package was tied to one
          // instructor, but the app defaulted to a different one,
          // and picking the wrong instructor meant it correctly (but
          // confusingly) asked them to pay again for something they
          // already owned. Falls back to the owner if they have no
          // existing package at all yet.
          const existingInstructorId = packages.find((p) => p.instructorMembershipId)?.instructorMembershipId;
          const owner = list.find((i) => i.role === "owner");
          const defaultId = (existingInstructorId && list.some((i) => i.id === existingInstructorId)) ? existingInstructorId : owner?.id;
          if (defaultId) setSelectedInstructorId(defaultId);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Packages are tied to a specific instructor (pricing is per-instructor),
  // so switching who you're booking with should surface whatever you
  // already own *with them* - not a package bought from someone else.
  useEffect(() => {
    if (!selectedInstructorId) {
      setSelectedPackageId(null);
      return;
    }
    const owned = packages.find((p) => p.instructorMembershipId === selectedInstructorId && (p.rawLessonsRemaining ?? p.lessonsRemaining) > 0);
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

  async function depositAndBookSlot() {
    if (!selected || !pendingPackageType || !selectedInstructorId || !contactValid()) return;
    saveProfileFieldsIfProvided();
    setConfirming(true);
    const res = await fetch(`${apiBase}/packages/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageType: pendingPackageType,
        instructorMembershipId: selectedInstructorId,
        availabilityId: selected.id,
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

  async function clubBilledAndBookSlot() {
    if (!selected || !pendingPackageType || !selectedInstructorId || !contactValid()) return;
    saveProfileFieldsIfProvided();
    setConfirming(true);
    const res = await fetch(`${apiBase}/packages/club-billed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageType: pendingPackageType,
        instructorMembershipId: selectedInstructorId,
        availabilityId: selected.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        contactEmail: contact.email,
        isRemote,
      }),
    });
    setConfirming(false);
    const data = await res.json();
    if (res.ok) {
      setPackages((prev) => [...prev, data]);
      setMessage(`Reserved - ${business.name} bills you separately for this.`);
      setSelected(null);
      setPendingPackageType(null);
      loadSlots();
      loadMyBookings();
    } else {
      setMessage(data.error || "Something went wrong.");
    }
  }

  // Books directly against an already-owned package - no payment involved.
  async function saveProfileFieldsIfProvided() {
    const updates: Record<string, string> = {};
    if (contact.handedness) updates.handedness = contact.handedness;
    if (contact.scoreOrHandicap.trim()) updates.scoreOrHandicap = contact.scoreOrHandicap.trim();
    if (contact.commonIssues.trim()) updates.commonIssues = contact.commonIssues.trim();
    if (Object.keys(updates).length === 0) return;
    try {
      await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch {
      // Non-critical - the booking itself doesn't depend on this succeeding.
    }
  }

  async function bookLesson() {
    if (!selected || !selectedPackage || !selectedInstructorId || !contactValid()) return;
    saveProfileFieldsIfProvided();
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
          ? "Request sent - this time is held for you. You'll be confirmed shortly."
          : created.videoCallUrl
          ? "Lesson booked - your video call link is ready below."
          : "Lesson booked and synced to the calendar."
      );
      setSelected(null);
      setPackages((prev) => prev.map((p) => (p.id === selectedPackageId ? { ...p, rawLessonsRemaining: (p.rawLessonsRemaining ?? p.lessonsRemaining) - 1 } : p)));
      loadSlots();
      loadMyBookings();
    } else {
      const err = await res.json();
      setMessage(err.error || "Something went wrong.");
    }
  }

  // Buying a brand new package for a specific slot - the slot comes along in
  // checkout metadata, so paying both purchases the package AND books that
  // slot with the first credit, all in one step (see the webhook).
  async function buyPackageAndBookSlot() {
    if (!selected || !pendingPackageType || !selectedInstructorId || !contactValid()) return;
    saveProfileFieldsIfProvided();
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

  async function joinGroupSession() {
    if (!selected || !contactValid()) return;
    saveProfileFieldsIfProvided();
    setConfirming(true);
    const res = await fetch(`${apiBase}/groups/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        availabilityId: selected.id,
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

  async function bookFitting() {
    if (!selected || !fittingType || !selectedInstructorId || !contactValid()) return;
    saveProfileFieldsIfProvided();
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
  // configured Daily.co - the booking would go through but never get a
  // working call link, which is a worse experience than just not offering
  // it. Computed once and reused everywhere the package list renders.
  function visiblePackages(inst: any) {
    const list = enabledPackages(inst || {});
    return remoteLessonsEnabled ? list : list.filter((p) => p.id !== "video");
  }

  const pendingPackageInfo = pendingPackageType && selectedInstructor ? visiblePackages(selectedInstructor).find((p) => p.id === pendingPackageType) || null : null;

  // The "Video lesson" package is inherently remote - no need to also flip
  // a separate toggle for it. Any other package still goes through the
  // toggle normally (a player can take a regular lesson remotely too).
  const isVideoPackage = selectedPackage?.type === "video" || pendingPackageType === "video";
  useEffect(() => {
    if (isVideoPackage) setIsRemote(true);
  }, [isVideoPackage]);
  const activeFitting = fittingType && selectedInstructor
    ? { ...FITTING_TYPES.find((f) => f.id === fittingType)!, priceCents: getFittingPriceCents(selectedInstructor, fittingType) }
    : null;
  // Either an owned package with credits, or a tier chosen to buy - either is enough to pick a slot, but only once an instructor is chosen too.
  const canPickLessonSlot = !!selectedInstructorId && ((!!selectedPackage && (selectedPackage.rawLessonsRemaining ?? selectedPackage.lessonsRemaining) > 0) || !!pendingPackageType);
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
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {business.logoUrl && (
                <img src={business.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
              )}
              <span className="display" style={{ fontSize: 18, fontWeight: 700, color: "var(--chalk)" }}>
                {business.name}
              </span>
            </span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {!isNative && (
                <>
                  <a href={`${basePath}/videos`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                    Swing videos
                  </a>
                  <a href={`${basePath}/swing-sketches`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                    Swing Sketches
                  </a>
                </>
              )}
              <a href={`${basePath}/shop`} style={{
                fontSize: 12.5, fontWeight: 600, color: "#D7DED9", textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "5px 13px",
              }}>
                Shop
              </a>
              <a href={`${basePath}/gift-cards`} style={{
                fontSize: 12.5, fontWeight: 600, color: "#D7DED9", textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "5px 13px",
              }}>
                Gift Cards
              </a>
              <a href={`${basePath}/messages`} style={{
                position: "relative", fontSize: 12.5, fontWeight: 600, color: "#D7DED9", textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "5px 13px",
              }}>
                Messages
                {unreadMessages > 0 && (
                  <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "#B8862B", border: "1px solid var(--fairway)" }} />
                )}
              </a>
              {!isNative && (
                <a href={`${basePath}/settings`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
                  Settings
                </a>
              )}
              <button onClick={() => signOut({ callbackUrl: "/login" })} style={{
                background: "none", color: "#D7DED9", fontSize: 12.5, fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: "5px 13px",
              }}>
                Sign out
              </button>
            </div>
          </div>
          <h1 className="display" style={{ fontSize: 26, margin: "0 0 4px" }}>
            {service === "lesson" ? "Book a lesson" : "Book a club fitting"}
          </h1>
          {business.instructorName && instructors.length <= 1 && (
            <p style={{ fontSize: 16, fontWeight: 600, color: "#D7DED9", margin: "0 0 14px" }}>
              with {business.instructorName}
            </p>
          )}

          {instructors.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "#FFFFFF", marginBottom: 8, letterSpacing: "0.04em" }}>
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
              This is a remote lesson - you'll get a video call link once it's confirmed.
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
                        ? `${selectedPackage.lessonsRemaining} of ${selectedPackage.lessonsTotal} left${selectedPackage.paymentStatus === "pending" ? " - pay at lesson" : selectedPackage.paymentStatus === "deposit_paid" && !!selectedPackage.balanceDueCents ? ` - ${centsToDollars(selectedPackage.balanceDueCents)} due at lesson` : selectedPackage.paymentStatus === "club_billed" ? ` - billed by ${business.name}` : ""}`
                        : `${centsToDollars(pendingPackageInfo!.priceCents)} - pick a time, then pay`}
                    </div>
                  </button>
                </div>
              )}
              <div>
                <div className="mono" style={{ fontSize: 11, color: "#9DB8A9", marginBottom: 8, letterSpacing: "0.04em" }}>
                  {selectedPackage || pendingPackageInfo ? "SWITCH PACKAGE" : packages.some((p) => (p.rawLessonsRemaining ?? p.lessonsRemaining) > 0) ? "SELECT A PACKAGE" : "CHOOSE A PACKAGE TO GET STARTED"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {visiblePackages(selectedInstructor || {}).length === 0 ? null : (
                    visiblePackages(selectedInstructor || {}).map((p) => {
                      const owned = packages.find((op) => op.type === p.id && op.instructorMembershipId === selectedInstructorId && (op.rawLessonsRemaining ?? op.lessonsRemaining) > 0);
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
                      {centsToDollars(f.priceCents)} - {f.durationMin} min
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
          <div ref={messageRef} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
            {message}{" "}
            <button onClick={() => setMessage(null)} style={{ background: "none", border: "none", color: "var(--gold)", fontWeight: 600, fontSize: 13 }}>
              Dismiss
            </button>
          </div>
        )}

        {upcomingGroups.length > 0 && (() => {
          const filteredGroups = upcomingGroups.filter((g) => {
            if (groupFilter === "all") return true;
            if (groupFilter === "junior") return g.groupCategory === "junior_younger" || g.groupCategory === "junior_older";
            return g.groupCategory === groupFilter;
          });
          const hasCategories = upcomingGroups.some((g) => g.groupCategory);
          return (
            <div style={{ background: "#2A2470", border: "1px solid #5A4FCF", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div className="mono" style={{ fontSize: 11, color: "#C9C4FF", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 10 }}>
                UPCOMING GROUP LESSONS
              </div>

              {hasCategories && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {(["all", "men", "ladies", "junior"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setGroupFilter(f)}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, cursor: "pointer",
                        background: groupFilter === f ? "#FFF" : "rgba(255,255,255,0.1)",
                        color: groupFilter === f ? "#2A2470" : "#C9C4FF",
                        border: "1px solid rgba(255,255,255,0.2)",
                        textTransform: "capitalize",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}

              {filteredGroups.length === 0 ? (
                <p style={{ fontSize: 13, color: "#C9C4FF" }}>No sessions in this category right now.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedInstructorId(g.instructorMembershipId);
                        setSelected({
                          id: g.id,
                          startTime: g.startTime,
                          status: "open",
                          bookedServiceType: null,
                          isGroup: true,
                          groupCapacity: g.groupCapacity,
                          groupPriceCents: g.groupPriceCents,
                          groupSpotsTaken: g.groupSpotsTaken,
                          groupCategory: g.groupCategory,
                          groupAgeRange: g.groupAgeRange,
                        });
                      }}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
                        padding: "10px 12px", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div>
                        {formatGroupCategory(g.groupCategory, g.groupAgeRange) && (
                          <div className="mono" style={{ fontSize: 10.5, color: "#B8862B", fontWeight: 700, letterSpacing: "0.03em", marginBottom: 2 }}>
                            {formatGroupCategory(g.groupCategory, g.groupAgeRange)!.toUpperCase()}
                          </div>
                        )}
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#FFF" }}>
                          {new Date(g.startTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at{" "}
                          {new Date(g.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </div>
                        <div style={{ fontSize: 12, color: "#C9C4FF" }}>with {g.instructorName}</div>
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: "#FFF", fontWeight: 600, textAlign: "right" }}>
                        {centsToDollars(g.groupPriceCents)}
                        <div style={{ fontSize: 11, color: "#C9C4FF", fontWeight: 500 }}>
                          {g.groupSpotsTaken} of {g.groupCapacity} spots
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {(pushStatus === "off" || pushStatus === "enabling") && (
          <button
            onClick={enablePushNotifications}
            disabled={pushStatus === "enabling"}
            style={{
              display: "flex", alignItems: "center", gap: 6, background: "var(--card)", color: "var(--fairway)",
              border: "1px solid var(--border)", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, marginBottom: pushError ? 4 : 16,
            }}
          >
            {pushStatus === "enabling" ? "Enabling..." : "Get notified about your bookings"}
          </button>
        )}
        {pushError && (
          <p style={{ fontSize: 11, color: "#B23A3A", marginTop: -2, marginBottom: 16 }}>{pushError}</p>
        )}
        {pushStatus === "on" && (
          <p style={{ fontSize: 12, color: "var(--fairway)", marginBottom: 16 }}>
            🔔 Notifications are on — you'll get an alert when your bookings are confirmed or if anything changes.
          </p>
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
                    {b.status === "denied" && (
                      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: "#B23A3A", background: "#FBE9E9", borderRadius: 4, padding: "3px 6px" }}>
                        DECLINED
                      </span>
                    )}
                  </div>
                  {b.status === "denied" && (
                    <p style={{ fontSize: 11.5, color: "#B23A3A", margin: "6px 0 0" }}>
                      The day and time you selected has a conflict. Please choose another time.
                    </p>
                  )}
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
              background: selectedPackage?.paymentStatus === "pending" || (selectedPackage?.paymentStatus === "deposit_paid" && !!selectedPackage?.balanceDueCents) || selectedPackage?.paymentStatus === "club_billed" || isBuyingPackage ? "#FBF3DE" : "var(--open)",
              border: `1px solid ${selectedPackage?.paymentStatus === "pending" || (selectedPackage?.paymentStatus === "deposit_paid" && !!selectedPackage?.balanceDueCents) || selectedPackage?.paymentStatus === "club_billed" || isBuyingPackage ? "#E3CE93" : "var(--border)"}`,
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {isBuyingPackage ? (
                  <>
                    Buying: <span style={{ color: "var(--gold)" }}>{pendingPackageInfo!.label}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}> - {centsToDollars(pendingPackageInfo!.priceCents)}</span>
                  </>
                ) : (
                  <>
                    Booking from: <span style={{ color: "var(--gold)" }}>{selectedPackage!.type}</span>
                    <span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}> - {selectedPackage!.lessonsRemaining} of {selectedPackage!.lessonsTotal} left</span>
                    {selectedPackage!.paymentStatus === "pending" && (
                      <span className="mono" style={{ color: "#9A7A1E", fontWeight: 600 }}> - payment due at first lesson</span>
                    )}
                    {selectedPackage!.paymentStatus === "deposit_paid" && !!selectedPackage!.balanceDueCents && (
                      <span className="mono" style={{ color: "#9A7A1E", fontWeight: 600 }}> - {centsToDollars(selectedPackage!.balanceDueCents)} due at your lesson</span>
                    )}
                    {selectedPackage!.paymentStatus === "club_billed" && (
                      <span className="mono" style={{ color: "#9A7A1E", fontWeight: 600 }}> - billed by {business.name}</span>
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
                <span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}> - {centsToDollars(activeFitting.priceCents)} - {activeFitting.durationMin} min</span>
              </span>
            </div>
          )
        )}

        <div ref={calendarRef} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} -{" "}
            {new Date(weekStart.getTime() + 6 * DAY_MS).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))} style={navBtnStyle}>Prev</button>
            <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))} style={navBtnStyle}>Next</button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading availability...</p>
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
                      // Timezone-safe conversion - see lib/time.ts. Naive
                      // setHours() here is what caused this same lookup to
                      // silently miss most slots.
                      const dt = wallClockToUTC(dayDate, h, m);
                      const key = dt.toISOString();
                      const slot = slotsByKey[key];
                      if (!slot) return null;
                      const isOpen = slot.status === "open";
                      const isBooked = slot.status === "booked";
                      const isPending = slot.status === "pending";
                      const isSelected = selected?.id === slot.id;
                      // Anything less than 24 hours out isn't bookable -
                      // most instructors have their day already planned by
                      // that point, same as most people. An instructor can
                      // explicitly override this for one specific slot
                      // (allowLastMinute) - e.g. reopening a same-day
                      // cancellation for any player to grab.
                      const isTooSoon = !slot.allowLastMinute && dt.getTime() < Date.now() + 24 * 60 * 60 * 1000;
                      const isGroupJoinable = !!slot.isGroup && (slot.groupSpotsTaken ?? 0) < (slot.groupCapacity ?? 0);
                      const canPick = slot.isGroup
                        ? isGroupJoinable
                        : isOpen && !isTooSoon && (service === "lesson" ? canPickLessonSlot : !!fittingType && !!selectedInstructorId);
                      const bookedBg = slot.bookedServiceType === "fitting"
                        ? "#B8862B"
                        : slot.bookedIsRemote
                        ? "var(--remote)"
                        : "var(--fairway)";
                      return (
                        <button
                          key={time}
                          disabled={!canPick}
                          onClick={() => setSelected(isSelected ? null : slot)}
                          style={{
                            padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: isPending ? "1px dashed #B8862B" : "none",
                            background: isSelected
                              ? "var(--gold)"
                              : slot.isGroup
                              ? (isGroupJoinable ? "#E4E1FF" : "#5A4FCF")
                              : canPick ? "var(--open)" : isBooked ? bookedBg : isPending ? "#FBF3DE" : "var(--closed)",
                            color: isSelected ? "#FFF" : (isBooked || (slot.isGroup && !isGroupJoinable)) ? "var(--chalk)" : "var(--ink)",
                            cursor: canPick ? "pointer" : "default",
                          }}
                        >
                          {isPending ? "(pending)" : slot.isGroup ? `${formatTime12h(time)} · ${slot.groupSpotsTaken ?? 0}/${slot.groupCapacity}` : formatTime12h(time)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selected && selected.isGroup && (
          <div
            ref={confirmCardRef}
            style={{
              marginTop: 20, background: "var(--fairway)", borderRadius: 12, padding: "18px 18px 16px",
              border: "2px solid var(--gold)", boxShadow: "0 4px 20px rgba(184,134,43,0.35)",
            }}
          >
            <div className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 8 }}>
              {formatGroupCategory(selected.groupCategory, selected.groupAgeRange)
                ? `JOIN - ${formatGroupCategory(selected.groupCategory, selected.groupAgeRange)!.toUpperCase()}`
                : "JOIN THIS GROUP LESSON"}
            </div>
            <div style={{ color: "var(--chalk)", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {new Date(selected.startTime).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at{" "}
                {new Date(selected.startTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "#9DB8A9" }}>
                {centsToDollars(selected.groupPriceCents ?? 0)} - {selected.groupSpotsTaken ?? 0} of {selected.groupCapacity} spots taken
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <input
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                placeholder="Full name"
                className="contact-input"
                style={contactInputStyle}
              />
              <input
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                placeholder="Phone number *"
                type="tel"
                required
                className="contact-input"
                style={contactInputStyle}
              />
              <input
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                placeholder="Email address"
                type="email"
                className="contact-input"
                style={contactInputStyle}
              />
            </div>
            <button
              onClick={joinGroupSession}
              disabled={confirming || !contactValid()}
              style={{
                width: "100%", background: "var(--gold)", color: "var(--fairway)", border: "none", borderRadius: 8,
                padding: "10px 18px", fontWeight: 700, fontSize: 14,
                opacity: confirming || !contactValid() ? 0.6 : 1,
              }}
            >
              {confirming ? "..." : "Pay & Join"}
            </button>
            <button
              onClick={() => setSelected(null)}
              style={{
                width: "100%", background: "none", color: "#C9C4FF", border: "none",
                padding: "10px 18px", fontWeight: 600, fontSize: 13, marginTop: 4,
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {selected && !selected.isGroup && (
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
                    ? `${pendingPackageInfo!.label} - ${centsToDollars(pendingPackageInfo!.priceCents)}`
                    : `Uses 1 of ${selectedPackage?.lessonsRemaining ?? 0} remaining`
                  : activeFitting ? `${activeFitting.label} - ${centsToDollars(activeFitting.priceCents)}` : ""}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <input
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                placeholder="Full name"
                className="contact-input"
                style={contactInputStyle}
              />
              <input
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                placeholder="Phone number *"
                type="tel"
                required
                className="contact-input"
                style={contactInputStyle}
              />
              <input
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                placeholder="Email address"
                type="email"
                className="contact-input"
                style={contactInputStyle}
              />

              <div className="mono" style={{ fontSize: 10.5, color: "#9DB8A9", letterSpacing: "0.05em", marginTop: 4 }}>
                OPTIONAL - HELPS YOUR INSTRUCTOR PREPARE
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setContact((c) => ({ ...c, handedness: c.handedness === "right" ? "" : "right" }))}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: contact.handedness === "right" ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.15)",
                    background: contact.handedness === "right" ? "rgba(184,134,43,0.18)" : "rgba(255,255,255,0.06)",
                    color: "var(--chalk)",
                  }}
                >
                  Right-handed
                </button>
                <button
                  type="button"
                  onClick={() => setContact((c) => ({ ...c, handedness: c.handedness === "left" ? "" : "left" }))}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                    border: contact.handedness === "left" ? "1px solid var(--gold)" : "1px solid rgba(255,255,255,0.15)",
                    background: contact.handedness === "left" ? "rgba(184,134,43,0.18)" : "rgba(255,255,255,0.06)",
                    color: "var(--chalk)",
                  }}
                >
                  Left-handed
                </button>
              </div>
              <input
                value={contact.scoreOrHandicap}
                onChange={(e) => setContact((c) => ({ ...c, scoreOrHandicap: e.target.value }))}
                placeholder="Handicap or average score"
                className="contact-input"
                style={contactInputStyle}
              />
              <textarea
                value={contact.commonIssues}
                onChange={(e) => setContact((c) => ({ ...c, commonIssues: e.target.value }))}
                placeholder="Anything you're working on or struggle with?"
                rows={2}
                className="contact-input"
                style={{ ...contactInputStyle, resize: "vertical" }}
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
              {confirming ? "..." : service === "lesson" && !isBuyingPackage ? "Confirm" : "Pay & Confirm"}
            </button>

            {service === "lesson" && isBuyingPackage && business.allowPayLater && (
              <button
                onClick={depositAndBookSlot}
                disabled={confirming || !contactValid() || !selectedInstructorId}
                style={{
                  width: "100%", background: "none", color: "var(--chalk)", border: "1px dashed rgba(255,255,255,0.4)",
                  borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 14, marginTop: 8,
                  opacity: confirming || !contactValid() || !selectedInstructorId ? 0.6 : 1,
                }}
              >
                Pay {centsToDollars(Math.floor((pendingPackageInfo?.priceCents || 0) / 2))} now, rest at your lesson
              </button>
            )}

            {service === "lesson" && isBuyingPackage && business.allowClubBilling && (
              <button
                onClick={clubBilledAndBookSlot}
                disabled={confirming || !contactValid() || !selectedInstructorId}
                style={{
                  width: "100%", background: "none", color: "var(--chalk)", border: "1px dashed rgba(255,255,255,0.4)",
                  borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 14, marginTop: 8,
                  opacity: confirming || !contactValid() || !selectedInstructorId ? 0.6 : 1,
                }}
              >
                Reserve - {business.name} bills me separately
              </button>
            )}

            <button
              onClick={() => setSelected(null)}
              style={{
                width: "100%", background: "none", color: "#D7DED9", border: "none",
                padding: "10px 18px", fontWeight: 600, fontSize: 13, marginTop: 4,
              }}
            >
              Cancel
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}
