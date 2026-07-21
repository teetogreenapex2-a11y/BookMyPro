"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import "./onboarding.css";

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

function slugifyPreview(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const inputClass = "ob-input";
const labelStyle = { fontSize: 12, fontWeight: 600, color: "#5C6459", marginBottom: 6 };

function StepHeader({ step, eyebrow, title, subtitle }: { step: number; eyebrow: string; title: string; subtitle?: string }) {
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ height: 4, flex: 1, borderRadius: 2, background: n <= step ? "#1B3A2F" : "#E5E0D0" }} />
        ))}
      </div>
      <div className="ob-mono" style={{ fontSize: 12, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 6 }}>
        STEP {step} OF 4 · {eyebrow}
      </div>
      <h1 className="ob-display" style={{ fontSize: 24, margin: "0 0 6px", fontFamily: "'Inter', sans-serif", color: "#1B3A2F" }}>
        {title}
      </h1>
      {subtitle && <p style={{ fontSize: 13, color: "#8A8571", margin: "0 0 20px" }}>{subtitle}</p>}
      {!subtitle && <div style={{ marginBottom: 20 }} />}
    </>
  );
}

function ToggleRow({ label, sub, enabled, onToggle, priceCents, onPrice }: {
  label: string; sub: string; enabled: boolean; onToggle: () => void; priceCents: number; onPrice: (cents: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: enabled ? 1 : 0.5 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
        aria-pressed={enabled}
        style={{ width: 36, height: 21, borderRadius: 11, border: "none", flexShrink: 0, background: enabled ? "#1B3A2F" : "#DDD8C8", position: "relative" }}
      >
        <span style={{ position: "absolute", top: 2.5, left: enabled ? 18 : 2.5, width: 16, height: 16, borderRadius: "50%", background: "#FFF" }} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 600, width: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#8A8571" }}>$</span>
      <input
        value={priceCents / 100}
        onChange={(e) => { const d = Number(e.target.value); onPrice(Number.isFinite(d) ? Math.round(d * 100) : 0); }}
        disabled={!enabled}
        inputMode="numeric"
        style={{ flex: 1, border: "1px solid #DDD8C8", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 14, background: enabled ? "#FFF" : "#F2F0E9" }}
      />
      <span className="ob-mono" style={{ fontSize: 11, color: "#8A8571", width: 56, textAlign: "right" }}>{sub}</span>
    </div>
  );
}

export default function OnboardingClient() {
  const searchParams = useSearchParams();

  // Step 1 fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState("");
  const [lessonRate, setLessonRate] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [origin, setOrigin] = useState("");

  // Wizard state — once step 1 finishes, the business is real, and every
  // later step operates on it directly rather than collecting more form
  // data to submit all at once. This also means refreshing mid-wizard, or
  // coming back from a Google/Outlook OAuth redirect, doesn't lose progress
  // — it's resumed from the URL (see the effect below).
  const [step, setStep] = useState(1);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [ownerMembershipId, setOwnerMembershipId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: pricing
  const [pricing, setPricing] = useState<Record<string, any> | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // Step 3: team
  const [team, setTeam] = useState<{ id: string; name: string; email: string }[]>([]);
  const [teamName, setTeamName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);

  // Step 4: calendar
  const [calendarResult, setCalendarResult] = useState<"connected" | "error" | null>(null);

  const apiBase = createdSlug ? `/api/${createdSlug}` : "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Resume mid-wizard — either a page refresh, or coming back from the
  // Google/Outlook OAuth redirect (which lands here with these same params).
  useEffect(() => {
    const resumeSlug = searchParams.get("slug");
    const resumeStep = Number(searchParams.get("step"));
    const calendarParam = searchParams.get("calendar");
    if (calendarParam === "connected" || calendarParam === "error") setCalendarResult(calendarParam);

    if (resumeSlug && resumeStep >= 2 && resumeStep <= 4) {
      setCreatedSlug(resumeSlug);
      setStep(resumeStep);
      fetch(`/api/${resumeSlug}/instructors`)
        .then((r) => r.json())
        .then((list) => {
          if (Array.isArray(list) && list.length > 0) {
            setOwnerMembershipId(list[0].id);
            setPricing(list[0]);
            setTeam(list.slice(1).map((t: any) => ({ id: t.id, name: t.name, email: t.email })));
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-derive the slug from the business name until the person edits it directly.
  useEffect(() => {
    if (!slugEdited) setSlug(slugifyPreview(name));
  }, [name, slugEdited]);

  // Debounced live availability check as the slug changes.
  useEffect(() => {
    if (step !== 1 || !slug) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/businesses?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        setSlugStatus(data.available ? "available" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [slug, step]);

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a business name.");
      return;
    }
    if (slugStatus === "taken") {
      setError("That URL is already taken — try a different one.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, email, hours, lessonRate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      setCreatedSlug(data.slug);
      setOwnerMembershipId(data.ownerMembershipId);
      setSubmitting(false);

      // Pull the real, server-side default pricing to edit in step 2,
      // rather than guessing at defaults on the client and risking drift.
      setPricingLoading(true);
      const instRes = await fetch(`/api/${data.slug}/instructors`);
      const instructors = await instRes.json();
      const mine = instructors.find((i: any) => i.id === data.ownerMembershipId);
      setPricing(mine || null);
      setPricingLoading(false);

      setStep(2);
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  async function savePricingAndContinue() {
    if (createdSlug && ownerMembershipId && pricing) {
      setSubmitting(true);
      await fetch(`${apiBase}/instructors/${ownerMembershipId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricing),
      }).catch(() => {});
      setSubmitting(false);
    }
    setStep(3);
  }

  async function addTeamMember() {
    if (!teamName.trim() || !teamEmail.trim()) {
      setTeamError("Enter a name and email.");
      return;
    }
    setAddingTeam(true);
    setTeamError(null);
    try {
      const res = await fetch(`${apiBase}/instructors/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName, email: teamEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTeamError(data.error || "Couldn't add that person.");
        setAddingTeam(false);
        return;
      }
      setTeam((prev) => [...prev, data]);
      setTeamName("");
      setTeamEmail("");
      setAddingTeam(false);
    } catch {
      setTeamError("Something went wrong. Try again.");
      setAddingTeam(false);
    }
  }

  function finishToDashboard() {
    window.location.href = `${origin}/${createdSlug}/instructor`;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway, #1B3A2F)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "36px 32px", maxWidth: 460, width: "100%" }}>

        {step === 1 && (
          <>
            <StepHeader step={1} eyebrow="THE BASICS" title="Set up your booking page" />
            <form onSubmit={handleCreateBusiness} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label>
                <div style={labelStyle}>Business name</div>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fairway Golf Academy" />
              </label>

              <label>
                <div style={labelStyle}>Your booking page URL</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ob-mono" style={{ fontSize: 12, color: "#8A8571", whiteSpace: "nowrap" }}>{origin}/</span>
                  <input
                    className={inputClass}
                    value={slug}
                    onChange={(e) => { setSlug(slugifyPreview(e.target.value)); setSlugEdited(true); }}
                    placeholder="fairway-golf-academy"
                  />
                </div>
                {slugStatus === "checking" && <div style={{ fontSize: 12, color: "#8A8571", marginTop: 4 }}>Checking availability…</div>}
                {slugStatus === "available" && <div style={{ fontSize: 12, color: "#3E7A56", marginTop: 4 }}>Available</div>}
                {slugStatus === "taken" && <div style={{ fontSize: 12, color: "#B23A3A", marginTop: 4 }}>Already taken — try something else</div>}
              </label>

              <label>
                <div style={labelStyle}>Contact email</div>
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@yourbusiness.com" />
              </label>

              <label>
                <div style={labelStyle}>Business hours (optional)</div>
                <input className={inputClass} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Sat, 8:00 AM – 5:00 PM" />
              </label>

              <label>
                <div style={labelStyle}>Lesson rate (optional)</div>
                <input className={inputClass} value={lessonRate} onChange={(e) => setLessonRate(e.target.value)} placeholder="$120/hr" />
              </label>

              {error && <div style={{ fontSize: 13, color: "#B23A3A" }}>{error}</div>}

              <button
                type="submit"
                disabled={submitting || slugStatus === "taken"}
                style={{ background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14, marginTop: 6, opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? "Creating…" : "Continue"}
              </button>
              <p style={{ fontSize: 12, color: "#8A8571", textAlign: "center", margin: "4px 0 0" }}>
                A few quick steps after this — pricing, your team, and your calendar. You can skip any of them and set it up later.
              </p>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <StepHeader step={2} eyebrow="PRICING" title="Set your rates" subtitle="These are your own rates as an instructor — anyone else you add later sets their own." />
            {pricingLoading || !pricing ? (
              <p style={{ fontSize: 13, color: "#8A8571" }}>Loading…</p>
            ) : (
              <>
                <div className="ob-mono" style={{ fontSize: 10, fontWeight: 700, color: "#8A8571", letterSpacing: "0.04em", marginBottom: 8 }}>LESSON PACKAGES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                  {PACKAGE_ROWS.map((row) => (
                    <ToggleRow
                      key={row.id}
                      label={row.label}
                      sub={`${row.lessons} lessons`}
                      enabled={pricing[row.enabledKey]}
                      onToggle={() => setPricing((p) => p && ({ ...p, [row.enabledKey]: !p[row.enabledKey] }))}
                      priceCents={pricing[row.priceKey]}
                      onPrice={(cents) => setPricing((p) => p && ({ ...p, [row.priceKey]: cents }))}
                    />
                  ))}
                </div>

                <div className="ob-mono" style={{ fontSize: 10, fontWeight: 700, color: "#8A8571", letterSpacing: "0.04em", marginBottom: 8 }}>CLUB FITTINGS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
                  {FITTING_ROWS.map((row) => (
                    <ToggleRow
                      key={row.id}
                      label={row.label}
                      sub={row.duration}
                      enabled={pricing[row.enabledKey]}
                      onToggle={() => setPricing((p) => p && ({ ...p, [row.enabledKey]: !p[row.enabledKey] }))}
                      priceCents={pricing[row.priceKey]}
                      onPrice={(cents) => setPricing((p) => p && ({ ...p, [row.priceKey]: cents }))}
                    />
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setStep(3)}
                style={{ flex: 1, background: "transparent", color: "#5C6459", border: "1px solid #DDD8C8", borderRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 14 }}
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={savePricingAndContinue}
                disabled={submitting}
                style={{ flex: 1, background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14, opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? "Saving…" : "Continue"}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <StepHeader step={3} eyebrow="YOUR TEAM" title="Add other instructors" subtitle="Optional — skip this if it's just you for now. You can always add people later in Settings." />

            {team.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {team.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFF", border: "1px solid #E5E0D0", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                    <div className="ob-mono" style={{ fontSize: 11, color: "#8A8571", marginLeft: "auto" }}>{t.email}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              <input className={inputClass} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Instructor's name" />
              <input className={inputClass} type="email" value={teamEmail} onChange={(e) => setTeamEmail(e.target.value)} placeholder="Their email" />
              {teamError && <div style={{ fontSize: 13, color: "#B23A3A" }}>{teamError}</div>}
              <button
                type="button"
                onClick={addTeamMember}
                disabled={addingTeam}
                style={{ background: "#FFF", color: "#1B3A2F", border: "1px solid #1B3A2F", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, opacity: addingTeam ? 0.7 : 1 }}
              >
                {addingTeam ? "Adding…" : "+ Add instructor"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep(4)}
              style={{ width: "100%", background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14 }}
            >
              Continue
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <StepHeader step={4} eyebrow="CALENDAR" title="Connect your calendar" subtitle="Optional — bookings sync to Google or Outlook automatically, and events on your personal calendar block those times off. Skip this and connect later in Settings if you'd rather." />

            {calendarResult === "connected" && (
              <div style={{ background: "#E7F0EA", border: "1px solid #B7D6C2", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1B3A2F", marginBottom: 16 }}>
                Calendar connected.
              </div>
            )}
            {calendarResult === "error" && (
              <div style={{ background: "#FBEAEA", border: "1px solid #E3B0B0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B23A3A", marginBottom: 16 }}>
                That didn't work — you can try again, or skip and connect later in Settings.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <a
                href={`${apiBase}/calendar/connect?from=onboarding`}
                style={{ display: "block", textAlign: "center", background: "#FFF", color: "#1B3A2F", border: "1px solid #1B3A2F", borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
              >
                Connect Google Calendar
              </a>
              <a
                href={`${apiBase}/calendar/outlook/connect?from=onboarding`}
                style={{ display: "block", textAlign: "center", background: "#FFF", color: "#1B3A2F", border: "1px solid #1B3A2F", borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
              >
                Connect Outlook
              </a>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={finishToDashboard}
                style={{ flex: 1, background: "transparent", color: "#5C6459", border: "1px solid #DDD8C8", borderRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 14 }}
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={finishToDashboard}
                style={{ flex: 1, background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14 }}
              >
                Go to your dashboard
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
