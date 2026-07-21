"use client";

import { useEffect, useState } from "react";

type User = {
  name: string | null;
  email: string;
  phone: string | null;
  emailReminders: boolean;
  textReminders: boolean;
  reminderHours: number;
  handedness: string | null;
  scoreOrHandicap: string | null;
  commonIssues: string | null;
};

type Business = {
  name: string;
  email: string;
  hours: string;
  lessonRate: string;
  instructorName: string | null;
  packageSingleEnabled: boolean;
  packagePlayingEnabled: boolean;
  packageThreeEnabled: boolean;
  packageFiveEnabled: boolean;
  packageTenEnabled: boolean;
  packageSinglePriceCents: number;
  packagePlayingPriceCents: number;
  packageThreePriceCents: number;
  packageFivePriceCents: number;
  packageTenPriceCents: number;
  fittingDriverEnabled: boolean;
  fittingIronEnabled: boolean;
  fittingFullEnabled: boolean;
  fittingDriverPriceCents: number;
  fittingIronPriceCents: number;
  fittingFullPriceCents: number;
  allowPayLater: boolean;
  requireBookingApproval: boolean;
  bookingWindowDays: number;
  calendarProvider: string;
  notifyOnBooking: boolean;
  notificationEmail: string | null;
  paymentProvider: string;
  dailyApiKey: string | null;
  listedInDirectory: boolean;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

const PACKAGE_ROWS = [
  { id: "single", label: "Single lesson", lessons: 1, enabledKey: "packageSingleEnabled", priceKey: "packageSinglePriceCents" },
  { id: "playing", label: "Playing lesson", lessons: 1, enabledKey: "packagePlayingEnabled", priceKey: "packagePlayingPriceCents" },
  { id: "video", label: "Video lesson", lessons: 1, enabledKey: "packageVideoEnabled", priceKey: "packageVideoPriceCents" },
  { id: "three", label: "3-pack", lessons: 3, enabledKey: "packageThreeEnabled", priceKey: "packageThreePriceCents" },
  { id: "five", label: "5-pack", lessons: 5, enabledKey: "packageFiveEnabled", priceKey: "packageFivePriceCents" },
  { id: "ten", label: "10-pack", lessons: 10, enabledKey: "packageTenEnabled", priceKey: "packageTenPriceCents" },
] as const;

const FITTING_ROWS = [
  { id: "driver", label: "Driver fitting", duration: "45 min", enabledKey: "fittingDriverEnabled", priceKey: "fittingDriverPriceCents" },
  { id: "iron", label: "Iron fitting", duration: "60 min", enabledKey: "fittingIronEnabled", priceKey: "fittingIronPriceCents" },
  { id: "full", label: "Full bag fitting", duration: "90 min", enabledKey: "fittingFullEnabled", priceKey: "fittingFullPriceCents" },
] as const;

export default function SettingsClient({
  user,
  business,
  isInstructor,
  isOwner,
  slug,
  basePath,
  apiBase,
}: {
  user: User;
  business: Business;
  isInstructor: boolean;
  isOwner: boolean;
  slug: string;
  basePath: string;
  apiBase: string;
}) {
  const [tab, setTab] = useState<"profile" | "notifications" | "business">("profile");
  const [profile, setProfile] = useState({
    name: user.name || "",
    phone: user.phone || "",
    handedness: user.handedness || "",
    scoreOrHandicap: user.scoreOrHandicap || "",
    commonIssues: user.commonIssues || "",
  });
  const [notif, setNotif] = useState({
    emailReminders: user.emailReminders,
    textReminders: user.textReminders,
    reminderHours: user.reminderHours,
  });
  const [biz, setBiz] = useState(business);
  const [saved, setSaved] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; chargesEnabled: boolean; detailsSubmitted?: boolean } | null>(null);
  const [squareStatus, setSquareStatus] = useState<{ connected: boolean; expired: boolean } | null>(null);
  const [googleCalStatus, setGoogleCalStatus] = useState<{ connected: boolean } | null>(null);
  const [outlookStatus, setOutlookStatus] = useState<{ connected: boolean } | null>(null);
  const [team, setTeam] = useState<{ id: string; name: string | null; email: string; role: string; [key: string]: any }[]>([]);
  const [addInstructorOpen, setAddInstructorOpen] = useState(false);
  const [addInstructorForm, setAddInstructorForm] = useState({ name: "", email: "", specialty: "" });
  const [addingInstructor, setAddingInstructor] = useState(false);
  const [addInstructorError, setAddInstructorError] = useState<string | null>(null);
  // Which team member's pricing is currently shown/editable — pricing is
  // per-instructor now, not business-wide.
  const [pricingInstructorId, setPricingInstructorId] = useState<string | null>(null);
  const [instructorPricing, setInstructorPricing] = useState<Record<string, any> | null>(null);
  const [pricingSaved, setPricingSaved] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);

  async function loadTeam() {
    const res = await fetch(`${apiBase}/instructors`);
    if (res.ok) {
      const list = await res.json();
      setTeam(list);
      // Default to editing your own pricing if you're an instructor; the
      // owner viewing someone else's team can switch via the picker below.
      const defaultId = list.find((t: any) => t.email === user.email)?.id || list[0]?.id || null;
      setPricingInstructorId((prev) => prev || defaultId);
    }
  }

  useEffect(() => {
    const found = team.find((t) => t.id === pricingInstructorId);
    setInstructorPricing(found || null);
  }, [pricingInstructorId, team]);

  async function savePricing() {
    if (!pricingInstructorId || !instructorPricing) return;
    setSavingPricing(true);
    const res = await fetch(`${apiBase}/instructors/${pricingInstructorId}/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instructorPricing),
    });
    setSavingPricing(false);
    if (res.ok) {
      const updated = await res.json();
      setTeam((prev) => prev.map((t) => (t.id === pricingInstructorId ? { ...t, ...updated } : t)));
      setPricingSaved(true);
      setTimeout(() => setPricingSaved(false), 1800);
    }
  }

  async function saveSpecialty(instructorId: string, specialty: string) {
    await fetch(`${apiBase}/instructors/${instructorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialty }),
    }).catch(() => {});
  }

  async function addInstructor() {
    if (!addInstructorForm.name.trim() || !addInstructorForm.email.trim()) {
      setAddInstructorError("Name and email are required.");
      return;
    }
    setAddingInstructor(true);
    setAddInstructorError(null);
    const res = await fetch(`${apiBase}/instructors/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addInstructorForm),
    });
    const data = await res.json();
    setAddingInstructor(false);
    if (res.ok) {
      setTeam((prev) => [...prev, { ...data, role: "instructor" }]);
      setAddInstructorForm({ name: "", email: "", specialty: "" });
      setAddInstructorOpen(false);
    } else {
      setAddInstructorError(data.error || "Something went wrong.");
    }
  }

  useEffect(() => {
    if (isInstructor && tab === "business") {
      fetch(`${apiBase}/stripe/status`).then((r) => r.json()).then(setStripeStatus).catch(() => {});
      fetch(`${apiBase}/square/status`).then((r) => r.json()).then(setSquareStatus).catch(() => {});
      fetch(`${apiBase}/calendar/status`).then((r) => r.json()).then(setGoogleCalStatus).catch(() => {});
      fetch(`${apiBase}/calendar/outlook/status`).then((r) => r.json()).then(setOutlookStatus).catch(() => {});
      loadTeam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstructor, tab, apiBase]);

  async function save() {
    await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, ...notif }),
    });
    if (isInstructor) {
      await fetch(`${apiBase}/business`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(biz),
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const tabs = isInstructor
    ? (["profile", "notifications", "business"] as const)
    : (["profile", "notifications"] as const);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: "var(--fairway)", color: "var(--chalk)", padding: "24px 20px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h1 className="display" style={{ fontSize: 24, margin: 0 }}>Settings</h1>
            <a href={isInstructor ? `${basePath}/instructor` : `${basePath}/book`} style={{ fontSize: 13, color: "#D7DED9", textDecoration: "none" }}>
              ← Back
            </a>
          </div>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.08)", padding: 4, borderRadius: 10 }}>
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "8px 10px", borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600,
                background: tab === t ? "var(--chalk)" : "transparent",
                color: tab === t ? "var(--fairway)" : "#D7DED9", textTransform: "capitalize",
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 40px" }}>
        {tab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Full name" value={profile.name} onChange={(v) => setProfile((p) => ({ ...p, name: v }))} />
            <Field label="Email" value={user.email} onChange={() => {}} disabled />
            <Field label="Phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} />

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Golf profile</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Visible to your instructor whenever they look at one of your bookings — no need to repeat yourself every visit.
              </p>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Handedness</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["right", "left"] as const).map((h) => (
                    <button
                      key={h}
                      onClick={() => setProfile((p) => ({ ...p, handedness: h }))}
                      style={{
                        flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                        border: profile.handedness === h ? "1px solid var(--fairway)" : "1px solid var(--border)",
                        background: profile.handedness === h ? "var(--open)" : "#FFF", textTransform: "capitalize",
                      }}
                    >
                      {h}-handed
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label="Average score or handicap"
                value={profile.scoreOrHandicap}
                onChange={(v) => setProfile((p) => ({ ...p, scoreOrHandicap: v }))}
                placeholder="e.g. 92 average, or 14 handicap"
              />

              <label style={{ display: "block", marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Common issues (optional)</div>
                <textarea
                  value={profile.commonIssues}
                  onChange={(e) => setProfile((p) => ({ ...p, commonIssues: e.target.value }))}
                  rows={3}
                  placeholder="e.g. Slice with driver, tends to lift head on putts"
                  style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14 }}
                />
              </label>
            </div>
          </div>
        )}

        {tab === "notifications" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ToggleRow label="Email reminders" checked={notif.emailReminders} onChange={(v) => setNotif((n) => ({ ...n, emailReminders: v }))} />
            <ToggleRow label="Text reminders" checked={notif.textReminders} onChange={(v) => setNotif((n) => ({ ...n, textReminders: v }))} />
            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Remind me</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 24, 48].map((h) => (
                  <button key={h} onClick={() => setNotif((n) => ({ ...n, reminderHours: h }))} style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: notif.reminderHours === h ? "1px solid var(--fairway)" : "1px solid var(--border)",
                    background: notif.reminderHours === h ? "var(--open)" : "var(--card)",
                  }}>
                    {h}h before
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "business" && isInstructor && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Payments</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Choose which processor collects your payments — money goes directly to your own account either way.
              </p>

              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["stripe", "square"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setBiz((b) => ({ ...b, paymentProvider: p }))}
                    style={{
                      flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: biz.paymentProvider === p ? "1px solid var(--fairway)" : "1px solid var(--border)",
                      background: biz.paymentProvider === p ? "var(--open)" : "#FFF",
                      textTransform: "capitalize",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {biz.paymentProvider === "square" ? (
                squareStatus === null ? (
                  <p style={{ fontSize: 13, color: "var(--faint)" }}>Checking status…</p>
                ) : squareStatus.connected && !squareStatus.expired ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3E7A56" }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Connected — ready to accept payments</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: squareStatus.connected ? "#C99A2E" : "#B23A3A" }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {squareStatus.connected ? "Reconnection needed — token expired" : "Not connected — payments won't work until this is set up"}
                      </span>
                    </div>
                    <a href={`${apiBase}/square/connect`} style={{
                      display: "inline-block", background: "var(--fairway)", color: "var(--chalk)", fontWeight: 700,
                      fontSize: 13, padding: "8px 14px", borderRadius: 8, textDecoration: "none",
                    }}>
                      {squareStatus.connected ? "Reconnect Square" : "Connect Square"}
                    </a>
                  </div>
                )
              ) : stripeStatus === null ? (
                <p style={{ fontSize: 13, color: "var(--faint)" }}>Checking status…</p>
              ) : stripeStatus.chargesEnabled ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3E7A56" }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Connected — ready to accept payments</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: stripeStatus.connected ? "#C99A2E" : "#B23A3A" }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {stripeStatus.connected ? "Setup incomplete — payments aren't accepted yet" : "Not connected — payments won't work until this is set up"}
                    </span>
                  </div>
                  <a href={`${apiBase}/stripe/connect`} style={{
                    display: "inline-block", background: "var(--fairway)", color: "var(--chalk)", fontWeight: 700,
                    fontSize: 13, padding: "8px 14px", borderRadius: 8, textDecoration: "none",
                  }}>
                    {stripeStatus.connected ? "Finish Stripe setup" : "Connect Stripe"}
                  </a>
                </div>
              )}
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Calendar</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Choose which calendar system syncs your bookings.
              </p>

              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {(["google", "outlook"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setBiz((b) => ({ ...b, calendarProvider: p }))}
                    style={{
                      flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: biz.calendarProvider === p ? "1px solid var(--fairway)" : "1px solid var(--border)",
                      background: biz.calendarProvider === p ? "var(--open)" : "#FFF",
                      textTransform: "capitalize",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {biz.calendarProvider === "outlook" ? (
                outlookStatus === null ? (
                  <p style={{ fontSize: 13, color: "var(--faint)" }}>Checking status…</p>
                ) : outlookStatus.connected ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3E7A56" }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Connected — bookings will sync</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B23A3A" }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Not connected — bookings won't sync until this is set up</span>
                    </div>
                    <a href={`${apiBase}/calendar/outlook/connect`} style={{
                      display: "inline-block", background: "var(--fairway)", color: "var(--chalk)", fontWeight: 700,
                      fontSize: 13, padding: "8px 14px", borderRadius: 8, textDecoration: "none",
                    }}>
                      Connect Outlook
                    </a>
                  </div>
                )
              ) : googleCalStatus === null ? (
                <p style={{ fontSize: 13, color: "var(--faint)" }}>Checking status…</p>
              ) : googleCalStatus.connected ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3E7A56" }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Connected — bookings will sync</span>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B23A3A" }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Not connected — bookings won't sync until this is set up</span>
                  </div>
                  <a href={`${apiBase}/calendar/connect`} style={{
                    display: "inline-block", background: "var(--fairway)", color: "var(--chalk)", fontWeight: 700,
                    fontSize: 13, padding: "8px 14px", borderRadius: 8, textDecoration: "none",
                  }}>
                    Connect Google Calendar
                  </a>
                </div>
              )}
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Remote lessons</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Lets players book a video-call lesson instead of an in-person one. Runs on{" "}
                <a href="https://www.daily.co" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fairway)" }}>Daily.co</a>{" "}
                — sign up there, grab an API key from their dashboard, and paste it below. Leave this blank and the option just won't show up for players.
              </p>
              <input
                value={biz.dailyApiKey || ""}
                onChange={(e) => setBiz((b) => ({ ...b, dailyApiKey: e.target.value }))}
                placeholder="Daily.co API key"
                type="password"
                style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
              />
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Find a Pro directory</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Let new players discover your business by searching for pros
                in their area. This is entirely optional — turned off,
                you're still fully bookable by anyone you share your own
                link with, you just won't show up in directory search.
              </p>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={biz.listedInDirectory}
                  onChange={(e) => setBiz((b) => ({ ...b, listedInDirectory: e.target.checked }))}
                />
                List my business in the BookMyPro directory
              </label>
              {biz.listedInDirectory && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={biz.city || ""}
                    onChange={(e) => setBiz((b) => ({ ...b, city: e.target.value }))}
                    placeholder="City"
                    style={{ flex: 2, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
                  />
                  <input
                    value={biz.state || ""}
                    onChange={(e) => setBiz((b) => ({ ...b, state: e.target.value }))}
                    placeholder="State"
                    style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
                  />
                  <input
                    value={biz.zipCode || ""}
                    onChange={(e) => setBiz((b) => ({ ...b, zipCode: e.target.value }))}
                    placeholder="Zip"
                    style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }}
                  />
                </div>
              )}
            </div>

            <Field label="Business name" value={biz.name} onChange={(v) => setBiz((b) => ({ ...b, name: v }))} />
            <Field
              label="Instructor name"
              value={biz.instructorName || ""}
              onChange={(v) => setBiz((b) => ({ ...b, instructorName: v }))}
              placeholder="Rick Stitzer"
            />
            <Field label="Business email" value={biz.email} onChange={(v) => setBiz((b) => ({ ...b, email: v }))} />
            <Field label="Business hours" value={biz.hours} onChange={(v) => setBiz((b) => ({ ...b, hours: v }))} />
            <Field label="Lesson rate" value={biz.lessonRate} onChange={(v) => setBiz((b) => ({ ...b, lessonRate: v }))} />

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Team</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Everyone listed here shows up as an option when players choose who to book with.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: isOwner ? 12 : 0 }}>
                {team.map((t) => {
                  const canEditThis = isOwner || t.email === user.email;
                  return (
                  <div key={t.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                    background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name || t.email}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginBottom: canEditThis ? 4 : 0 }}>{t.email}</div>
                      {canEditThis ? (
                        <input
                          defaultValue={t.specialty || ""}
                          onBlur={(e) => {
                            const value = e.target.value;
                            setTeam((prev) => prev.map((p) => p.id === t.id ? { ...p, specialty: value } : p));
                            saveSpecialty(t.id, value);
                          }}
                          placeholder="Specialty (e.g. Short game, junior coaching)"
                          className="mono"
                          style={{
                            width: "100%", fontSize: 11, color: "var(--faint)", border: "1px solid var(--border)",
                            borderRadius: 6, padding: "5px 8px", fontFamily: "inherit", background: "#FFF", marginTop: 2,
                          }}
                        />
                      ) : t.specialty ? (
                        <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{t.specialty}</div>
                      ) : null}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)",
                      background: "#EFEBDD", borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                    }}>
                      {t.role}
                    </span>
                  </div>
                  );
                })}
              </div>

              {isOwner && (
                addInstructorOpen ? (
                  <div>
                    <input
                      value={addInstructorForm.name}
                      onChange={(e) => setAddInstructorForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Full name"
                      style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
                    />
                    <input
                      value={addInstructorForm.email}
                      onChange={(e) => setAddInstructorForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Email"
                      type="email"
                      style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
                    />
                    <input
                      value={addInstructorForm.specialty}
                      onChange={(e) => setAddInstructorForm((f) => ({ ...f, specialty: e.target.value }))}
                      placeholder="Specialty (optional)"
                      style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
                    />
                    {addInstructorError && <p style={{ fontSize: 12, color: "#B23A3A", margin: "0 0 8px" }}>{addInstructorError}</p>}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => setAddInstructorOpen(false)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                        Cancel
                      </button>
                      <button
                        onClick={addInstructor}
                        disabled={addingInstructor}
                        style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}
                      >
                        {addingInstructor ? "Adding…" : "Add instructor"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddInstructorOpen(true); setAddInstructorError(null); }}
                    style={{
                      background: "none", color: "var(--gold)", border: "1px dashed var(--border)",
                      borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, width: "100%",
                    }}
                  >
                    + Add instructor
                  </button>
                )
              )}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Require booking approval</div>
                <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>
                  When on, new bookings are held as pending until you confirm or deny them. When off, bookings are confirmed immediately.
                </p>
              </div>
              <button
                onClick={() => setBiz((b) => ({ ...b, requireBookingApproval: !b.requireBookingApproval }))}
                aria-label={biz.requireBookingApproval ? "Disable booking approval" : "Enable booking approval"}
                aria-pressed={biz.requireBookingApproval}
                style={{
                  width: 42, height: 24, borderRadius: 12, border: "none", flexShrink: 0,
                  background: biz.requireBookingApproval ? "var(--fairway)" : "var(--border)", position: "relative",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: biz.requireBookingApproval ? 21 : 3, width: 18, height: 18,
                  borderRadius: "50%", background: "#FFF", transition: "left 0.15s",
                }} />
              </button>
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Booking window</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                How many days ahead players can see and pick open slots. Increasing this immediately opens up more time on every instructor's calendar.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={biz.bookingWindowDays}
                  onChange={(e) => {
                    const days = Number(e.target.value);
                    setBiz((b) => ({ ...b, bookingWindowDays: Number.isFinite(days) && days > 0 ? Math.round(days) : b.bookingWindowDays }));
                  }}
                  inputMode="numeric"
                  style={{
                    width: 80, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
                    fontFamily: "inherit", fontSize: 14,
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--faint)" }}>days ahead (currently ~{Math.round(biz.bookingWindowDays / 7)} weeks)</span>
              </div>
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: biz.notifyOnBooking ? 14 : 0 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Email me about bookings</div>
                  <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>
                    Get an email whenever someone books a lesson or fitting — instant confirmations and pending requests alike.
                  </p>
                </div>
                <button
                  onClick={() => setBiz((b) => ({ ...b, notifyOnBooking: !b.notifyOnBooking }))}
                  aria-label={biz.notifyOnBooking ? "Disable booking email alerts" : "Enable booking email alerts"}
                  aria-pressed={biz.notifyOnBooking}
                  style={{
                    width: 42, height: 24, borderRadius: 12, border: "none", flexShrink: 0,
                    background: biz.notifyOnBooking ? "var(--fairway)" : "var(--border)", position: "relative",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 3, left: biz.notifyOnBooking ? 21 : 3, width: 18, height: 18,
                    borderRadius: "50%", background: "#FFF", transition: "left 0.15s",
                  }} />
                </button>
              </div>
              {biz.notifyOnBooking && (
                <Field
                  label="Send alerts to"
                  value={biz.notificationEmail || ""}
                  onChange={(v) => setBiz((b) => ({ ...b, notificationEmail: v }))}
                  placeholder={biz.email || "you@example.com"}
                />
              )}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Pay at first lesson</div>
                <p style={{ fontSize: 12, color: "var(--faint)", margin: 0 }}>
                  Let players reserve a package without paying online — you collect payment in person instead.
                </p>
              </div>
              <button
                onClick={() => setBiz((b) => ({ ...b, allowPayLater: !b.allowPayLater }))}
                aria-label={biz.allowPayLater ? "Disable pay at first lesson" : "Enable pay at first lesson"}
                aria-pressed={biz.allowPayLater}
                style={{
                  width: 42, height: 24, borderRadius: 12, border: "none", flexShrink: 0,
                  background: biz.allowPayLater ? "var(--fairway)" : "var(--border)", position: "relative",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: biz.allowPayLater ? 21 : 3, width: 18, height: 18,
                  borderRadius: "50%", background: "#FFF", transition: "left 0.15s",
                }} />
              </button>
            </div>

            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Lesson & fitting pricing</div>
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 12px" }}>
                Each instructor sets their own rates — what a player pays depends on who they book with.
              </p>

              {team.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {team.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setPricingInstructorId(t.id)}
                      style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                        border: pricingInstructorId === t.id ? "1px solid var(--fairway)" : "1px solid var(--border)",
                        background: pricingInstructorId === t.id ? "var(--open)" : "#FFF",
                      }}
                    >
                      {t.name || t.email}
                    </button>
                  ))}
                </div>
              )}

              {!instructorPricing ? (
                <p style={{ fontSize: 13, color: "var(--faint)" }}>Loading…</p>
              ) : (
                <>
                  <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em", marginBottom: 8 }}>
                    LESSON PACKAGES
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                    {PACKAGE_ROWS.map((row) => {
                      const enabled = instructorPricing[row.enabledKey];
                      const priceCents = instructorPricing[row.priceKey];
                      return (
                        <div key={row.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: enabled ? 1 : 0.5 }}>
                            <button
                              onClick={() => setInstructorPricing((p) => p && ({ ...p, [row.enabledKey]: !enabled }))}
                              aria-label={`${enabled ? "Disable" : "Enable"} ${row.label}`}
                              aria-pressed={enabled}
                              style={{
                                width: 36, height: 21, borderRadius: 11, border: "none", flexShrink: 0,
                                background: enabled ? "var(--fairway)" : "var(--border)", position: "relative",
                              }}
                            >
                              <span style={{
                                position: "absolute", top: 2.5, left: enabled ? 18 : 2.5, width: 16, height: 16,
                                borderRadius: "50%", background: "#FFF",
                              }} />
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 600, width: 92, flexShrink: 0 }}>{row.label}</span>
                            <span style={{ fontSize: 13, color: "var(--faint)" }}>$</span>
                            <input
                              value={priceCents / 100}
                              onChange={(e) => {
                                const dollars = Number(e.target.value);
                                setInstructorPricing((p) => p && ({ ...p, [row.priceKey]: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0 }));
                              }}
                              disabled={!enabled}
                              inputMode="numeric"
                              style={{
                                flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
                                fontFamily: "inherit", fontSize: 14, background: enabled ? "#FFF" : "#F2F0E9",
                              }}
                            />
                            <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{row.lessons} lessons</span>
                          </div>
                          {enabled && priceCents === 0 && (
                            <p style={{ fontSize: 11, color: "#9A7A1E", margin: "4px 0 0 46px" }}>
                              Not priced yet — players will see "TBD" and won't be able to purchase this until you set a price.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em", marginBottom: 8 }}>
                    CLUB FITTINGS
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                    {FITTING_ROWS.map((row) => {
                      const enabled = instructorPricing[row.enabledKey];
                      const priceCents = instructorPricing[row.priceKey];
                      return (
                        <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: enabled ? 1 : 0.5 }}>
                          <button
                            onClick={() => setInstructorPricing((p) => p && ({ ...p, [row.enabledKey]: !enabled }))}
                            aria-label={`${enabled ? "Disable" : "Enable"} ${row.label}`}
                            aria-pressed={enabled}
                            style={{
                              width: 36, height: 21, borderRadius: 11, border: "none", flexShrink: 0,
                              background: enabled ? "var(--fairway)" : "var(--border)", position: "relative",
                            }}
                          >
                            <span style={{
                              position: "absolute", top: 2.5, left: enabled ? 18 : 2.5, width: 16, height: 16,
                              borderRadius: "50%", background: "#FFF",
                            }} />
                          </button>
                          <span style={{ fontSize: 13, fontWeight: 600, width: 92, flexShrink: 0 }}>{row.label}</span>
                          <span style={{ fontSize: 13, color: "var(--faint)" }}>$</span>
                          <input
                            value={priceCents / 100}
                            onChange={(e) => {
                              const dollars = Number(e.target.value);
                              setInstructorPricing((p) => p && ({ ...p, [row.priceKey]: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0 }));
                            }}
                            disabled={!enabled}
                            inputMode="numeric"
                            style={{
                              flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px",
                              fontFamily: "inherit", fontSize: 14, background: enabled ? "#FFF" : "#F2F0E9",
                            }}
                          />
                          <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>{row.duration}</span>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={savePricing}
                    disabled={savingPricing}
                    style={{
                      background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8,
                      padding: "9px 16px", fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {savingPricing ? "Saving…" : pricingSaved ? "Saved" : "Save pricing"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
          {saved && <span style={{ fontSize: 13, color: "var(--fairway)", fontWeight: 600 }}>Saved</span>}
          <button onClick={save} style={{ background: "var(--fairway)", color: "var(--chalk)", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 14 }}>
            Save changes
          </button>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, background: disabled ? "#F2F0E9" : "#FFF" }}
      />
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13,
};

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <button onClick={() => onChange(!checked)} style={{
        width: 42, height: 24, borderRadius: 12, border: "none", background: checked ? "var(--fairway)" : "var(--border)", position: "relative",
      }}>
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#FFF", transition: "left 0.15s" }} />
      </button>
    </div>
  );
}
