"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import "./onboarding.css";

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

// Which kind of setup someone is doing - answered in the opening
// questionnaire (step 0), and what decides which of the steps below they
// actually see. "joining" never gets this far - it hands off to the
// existing join-as-instructor request flow instead.
type Track = "independent" | "joining" | "academy" | "club";

const TRACK_OPTIONS: { id: Track; title: string; sub: string }[] = [
  { id: "independent", title: "I teach on my own", sub: "An independent pro with my own students and my own schedule." },
  { id: "joining", title: "I'm joining an academy or club that's already on BookMyPro", sub: "Find it and send the owner a request - they approve you." },
  { id: "academy", title: "I run an academy or a team of instructors", sub: "Several instructors, one booking page." },
  { id: "club", title: "I'm a club pro and my club handles payment", sub: "The club collects and reimburses me separately." },
];

function StepHeader({ step, flow, eyebrow, title, subtitle }: { step: number; flow: number[]; eyebrow: string; title: string; subtitle?: string }) {
  // Position within the steps this person is actually seeing - someone
  // who skips the team step sees "STEP 3 OF 4" for payments, not a
  // confusing jump from 2 straight to 4.
  const total = flow.length;
  const position = Math.max(flow.indexOf(step), 0) + 1;
  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {flow.map((n, i) => (
          <div key={n} style={{ height: 4, flex: 1, borderRadius: 2, background: i < position ? "#1B3A2F" : "#E5E0D0" }} />
        ))}
      </div>
      <div className="ob-mono" style={{ fontSize: 12, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 6 }}>
        STEP {position} OF {total} · {eyebrow}
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
  // Step 0 is the opening questionnaire. Coming back mid-wizard (a page
  // refresh, or returning from a Google/Outlook/Stripe redirect) lands
  // straight on the right later step instead - see the resume effect below.
  const [step, setStep] = useState<number>(() => {
    const resumeStep = Number(searchParams.get("step"));
    return searchParams.get("slug") && resumeStep >= 2 && resumeStep <= 5 ? resumeStep : 0;
  });

  // Step 0 answers
  const [track, setTrack] = useState<Track | null>(null);
  const [offersLessons, setOffersLessons] = useState(true);
  const [offersFittings, setOffersFittings] = useState(true);
  const [academyQuery, setAcademyQuery] = useState("");
  const [academyResults, setAcademyResults] = useState<{ slug: string; name: string; city: string | null; state: string | null }[]>([]);
  const [academySearching, setAcademySearching] = useState(false);

  // Independent pros and club pros are a team of one, so the "add other
  // instructors" step is skipped for them. Anyone resuming mid-wizard
  // without an answer on hand just gets the full set, which is harmless.
  const flow = track === "independent" || track === "club" ? [1, 2, 4, 5] : [1, 2, 3, 4, 5];
  function nextStep(from: number) {
    const i = flow.indexOf(from);
    return flow[Math.min(i + 1, flow.length - 1)];
  }
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [ownerMembershipId, setOwnerMembershipId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: pricing
  const [pricing, setPricing] = useState<Record<string, any> | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [firstLessonMinutes, setFirstLessonMinutes] = useState("");
  const [firstLessonPrice, setFirstLessonPrice] = useState("");

  // Step 3: team
  const [team, setTeam] = useState<{ id: string; name: string; email: string }[]>([]);
  const [teamName, setTeamName] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  const [teamError, setTeamError] = useState<string | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);

  // Step 4: calendar
  const [calendarResult, setCalendarResult] = useState<"connected" | "error" | null>(null);
  // Step 5: payments
  const [paymentResult, setPaymentResult] = useState<"connected" | "error" | null>(null);
  const [payLaterEnabled, setPayLaterEnabled] = useState(false);
  const [enablingPayLater, setEnablingPayLater] = useState(false);

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
    const stripeParam = searchParams.get("stripe");
    const squareParam = searchParams.get("square");
    if (stripeParam === "connected" || squareParam === "connected") setPaymentResult("connected");
    else if (stripeParam === "error" || squareParam === "error") setPaymentResult("error");

    if (resumeSlug && resumeStep >= 2 && resumeStep <= 5) {
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

  // Debounced search for the academy someone is joining.
  useEffect(() => {
    if (step !== 0 || track !== "joining") return;
    const q = academyQuery.trim();
    if (q.length < 2) {
      setAcademyResults([]);
      setAcademySearching(false);
      return;
    }
    setAcademySearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/businesses/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setAcademyResults(Array.isArray(data) ? data : []);
      } catch {
        setAcademyResults([]);
      }
      setAcademySearching(false);
    }, 350);
    return () => clearTimeout(timeout);
  }, [academyQuery, track, step]);

  // Picking an academy hands off to the existing request flow, which
  // collects name/phone and emails the owner - nothing is granted until
  // the owner approves it in their Settings.
  function chooseAcademy(slug: string) {
    window.location.href = `${window.location.origin}/${slug}/join-as-instructor`;
  }

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
      // Someone who said they don't do club fittings shouldn't end up with
      // fittings switched on (at $0) on their booking page just because
      // that's the default - turn all three off explicitly.
      const payload = offersFittings
        ? pricing
        : { ...pricing, fittingDriverEnabled: false, fittingIronEnabled: false, fittingFullEnabled: false };
      await fetch(`${apiBase}/instructors/${ownerMembershipId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});

      const minutes = parseInt(firstLessonMinutes, 10);
      const priceDollars = parseFloat(firstLessonPrice);
      if (offersLessons && Number.isInteger(minutes) && minutes > 0 && !isNaN(priceDollars) && priceDollars >= 0) {
        await fetch(`${apiBase}/instructors/${ownerMembershipId}/durations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ minutes, singlePriceCents: Math.round(priceDollars * 100) }),
        }).catch(() => {});
      }

      setSubmitting(false);
    }
    setStep(nextStep(2));
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <Image src="/logo.jpg" alt="" width={44} height={44} style={{ borderRadius: 10, objectFit: "cover" }} />
          <a
            href="/features"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 700, color: "#1B3A2F", textDecoration: "none", border: "1px solid #E3D9C9", borderRadius: 8, padding: "8px 12px" }}
          >
            See everything included
          </a>
        </div>

        {step === 0 && (
          <>
            <div className="ob-mono" style={{ fontSize: 12, letterSpacing: "0.1em", color: "#B8862B", marginBottom: 6 }}>
              WELCOME
            </div>
            <h1 className="ob-display" style={{ fontSize: 24, margin: "0 0 6px", fontFamily: "'Inter', sans-serif", color: "#1B3A2F" }}>
              Let's tailor your setup
            </h1>
            <p style={{ fontSize: 13, color: "#8A8571", margin: "0 0 20px" }}>
              Two quick questions, so you only see the steps that apply to you.
            </p>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#1B3A2F", marginBottom: 10 }}>How do you work?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
              {TRACK_OPTIONS.map((opt) => {
                const selected = track === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTrack(opt.id)}
                    aria-pressed={selected}
                    style={{
                      textAlign: "left", background: selected ? "#E7F0EA" : "#FFF",
                      border: `1.5px solid ${selected ? "#1B3A2F" : "#E5E0D0"}`, borderRadius: 10, padding: "12px 14px",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F", marginBottom: 2 }}>{opt.title}</div>
                    <div style={{ fontSize: 12, color: "#8A8571" }}>{opt.sub}</div>
                  </button>
                );
              })}
            </div>

            {track === "joining" && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1B3A2F", marginBottom: 8 }}>Find your academy or club</div>
                <input
                  className={inputClass}
                  value={academyQuery}
                  onChange={(e) => setAcademyQuery(e.target.value)}
                  placeholder="Search by name or city"
                  autoFocus
                />
                {academySearching && <div style={{ fontSize: 12, color: "#8A8571", marginTop: 8 }}>Searching…</div>}
                {!academySearching && academyQuery.trim().length >= 2 && academyResults.length === 0 && (
                  <div style={{ fontSize: 12, color: "#8A8571", marginTop: 8 }}>
                    No match. Some academies keep their page private - ask the owner for their BookMyPro join link instead.
                  </div>
                )}
                {academyResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {academyResults.map((b) => (
                      <button
                        key={b.slug}
                        type="button"
                        onClick={() => chooseAcademy(b.slug)}
                        style={{ textAlign: "left", background: "#FFF", border: "1px solid #E5E0D0", borderRadius: 8, padding: "10px 14px" }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1B3A2F" }}>{b.name}</div>
                        {(b.city || b.state) && (
                          <div style={{ fontSize: 12, color: "#8A8571" }}>{[b.city, b.state].filter(Boolean).join(", ")}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 12, color: "#8A8571", margin: "14px 0 0" }}>
                  Picking one sends the owner a request. You'll get access once they approve it.
                </p>
              </>
            )}

            {track && track !== "joining" && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1B3A2F", marginBottom: 10 }}>What do you offer?</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#1B3A2F" }}>
                    <input type="checkbox" checked={offersLessons} onChange={(e) => setOffersLessons(e.target.checked)} />
                    Golf lessons
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#1B3A2F" }}>
                    <input type="checkbox" checked={offersFittings} onChange={(e) => setOffersFittings(e.target.checked)} />
                    Club fittings
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={!offersLessons && !offersFittings}
                  style={{ width: "100%", background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14, opacity: !offersLessons && !offersFittings ? 0.5 : 1 }}
                >
                  Continue
                </button>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <StepHeader step={1} flow={flow} eyebrow="THE BASICS" title="Set up your booking page" />
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
            <StepHeader step={2} flow={flow} eyebrow="PRICING" title="Set your rates" subtitle={track === "academy" ? "These are your own rates as an instructor — each instructor you add next sets their own." : "These are your own rates as an instructor — anyone else you add later sets their own."} />
            {pricingLoading || !pricing ? (
              <p style={{ fontSize: 13, color: "#8A8571" }}>Loading…</p>
            ) : (
              <>
                {offersLessons && (
                  <>
                    <div className="ob-mono" style={{ fontSize: 10, fontWeight: 700, color: "#8A8571", letterSpacing: "0.04em", marginBottom: 8 }}>YOUR FIRST LESSON</div>
                    <p style={{ fontSize: 12.5, color: "#8A8571", margin: "0 0 12px" }}>
                      Just enough to get your booking page working - add more lesson types, lengths, and packages anytime in Settings.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          value={firstLessonMinutes}
                          onChange={(e) => setFirstLessonMinutes(e.target.value)}
                          placeholder="Minutes"
                          inputMode="numeric"
                          style={{ width: 100, border: "1px solid #DDD8C8", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14 }}
                        />
                        <span style={{ fontSize: 13, color: "#8A8571" }}>min, $</span>
                        <input
                          value={firstLessonPrice}
                          onChange={(e) => setFirstLessonPrice(e.target.value)}
                          placeholder="Price"
                          inputMode="numeric"
                          style={{ width: 90, border: "1px solid #DDD8C8", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14 }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {offersFittings && (
                  <>
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
              </>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setStep(nextStep(2))}
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
            <StepHeader step={3} flow={flow} eyebrow="YOUR TEAM" title="Add other instructors" subtitle={track === "academy" ? "Add the instructors on your team now, or skip and add them later in Settings. Instructors who already use BookMyPro can also find your academy and request to join - you approve them." : "Optional — skip this if it's just you for now. You can always add people later in Settings."} />

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
            <StepHeader step={4} flow={flow} eyebrow="CALENDAR" title="Connect your calendar" subtitle="Optional — bookings sync to Google or Outlook automatically, and events on your personal calendar block those times off. Skip this and connect later in Settings if you'd rather." />

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
                onClick={() => setStep(5)}
                style={{ flex: 1, background: "transparent", color: "#5C6459", border: "1px solid #DDD8C8", borderRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 14 }}
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                style={{ flex: 1, background: "#1B3A2F", color: "#F6F4EE", border: "none", borderRadius: 8, padding: "12px 20px", fontWeight: 700, fontSize: 14 }}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <StepHeader
              step={5}
              flow={flow}
              eyebrow="GET PAID"
              title={track === "club" ? "How you get paid" : "Connect a payment processor"}
              subtitle={track === "club"
                ? "Since your club handles payment, turn on pay at lesson below - connecting a payment processor is optional."
                : "Required before you can accept paid bookings online — players can still browse and you can still test everything else without this, but skip it and connect later in Settings if you're not ready."}
            />

            {/* Club pros see the club-billing option first; everyone else sees
                the payment processors first. Same three pieces either way,
                just reordered with flex `order`. */}
            <div style={{ display: "flex", flexDirection: "column" }}>

            {paymentResult === "connected" && (
              <div style={{ background: "#E7F0EA", border: "1px solid #B7D6C2", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1B3A2F", marginBottom: 16 }}>
                Payment processor connected.
              </div>
            )}
            {paymentResult === "error" && (
              <div style={{ background: "#FBEAEA", border: "1px solid #E3B0B0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#B23A3A", marginBottom: 16 }}>
                That didn't work — you can try again, or skip and connect later in Settings.
              </div>
            )}

            <div style={{ order: track === "club" ? 3 : 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <a
                href={`${apiBase}/stripe/connect?from=onboarding`}
                style={{ display: "block", textAlign: "center", background: "#FFF", color: "#1B3A2F", border: "1px solid #1B3A2F", borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
              >
                Connect with Stripe
              </a>
              <a
                href={`${apiBase}/square/connect?from=onboarding`}
                style={{ display: "block", textAlign: "center", background: "#FFF", color: "#1B3A2F", border: "1px solid #1B3A2F", borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
              >
                Connect with Square
              </a>
            </div>

            <div style={{ order: 2, display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#E5E0D0" }} />
              <span style={{ fontSize: 11, color: "#8A8571" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "#E5E0D0" }} />
            </div>

            <div style={{ order: track === "club" ? 1 : 3, background: "#FFF", border: `1px solid ${track === "club" ? "#1B3A2F" : "#E5E0D0"}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
              {track === "club" && (
                <div className="ob-mono" style={{ fontSize: 10, fontWeight: 700, color: "#B8862B", letterSpacing: "0.06em", marginBottom: 6 }}>RECOMMENDED FOR YOU</div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "#1B3A2F" }}>Billed through your club instead?</div>
              <p style={{ fontSize: 12, color: "#8A8571", margin: "0 0 12px" }}>
                Common for club pros — the club collects payment and reimburses you separately, so there's nothing to connect here. Turn this on and players can book without paying online; you handle it however your club already does.
              </p>
              <button
                type="button"
                onClick={async () => {
                  setEnablingPayLater(true);
                  await fetch(`${apiBase}/business`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ allowPayLater: true }),
                  });
                  setEnablingPayLater(false);
                  setPayLaterEnabled(true);
                }}
                disabled={enablingPayLater || payLaterEnabled}
                style={{
                  width: "100%", textAlign: "center",
                  background: payLaterEnabled ? "#E7F0EA" : "#1B3A2F",
                  color: payLaterEnabled ? "#1B3A2F" : "#F6F4EE",
                  border: "none", borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 13,
                }}
              >
                {payLaterEnabled ? "Pay at lesson enabled" : enablingPayLater ? "Enabling…" : "Enable pay at lesson"}
              </button>
            </div>
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
