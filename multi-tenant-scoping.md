# Multi-Tenant Rebuild — Scoping Document

How to turn Tee to Green Golf from a single-business app into a platform
where any golf pro can sign up, configure their own business, and run their
own booking operation — while you own one shared codebase and (eventually)
one shared mobile app.

---

## 1. The core architectural change

Today, the app assumes **one business exists** — there's a single
`BusinessSettings` row, and code like `prisma.user.findFirst({ where: { role:
"instructor" } })` assumes there's only one instructor in the whole system.

Multi-tenancy means every piece of data needs to know **which business it
belongs to**, and every query needs to be scoped to the current business —
so Business A's bookings, packages, and calendar never leak into Business B.

---

## 2. Schema changes

### New: `Business` (replaces `BusinessSettings`)
```
Business
  id
  slug              // URL-friendly identifier, e.g. "tee-to-green"
  name
  email
  hours
  lessonRate
  packageSingleEnabled / PriceCents  (...same pattern for three/five/ten)
  fittingDriverEnabled / PriceCents  (...iron/full)
  stripeAccountId       // for Stripe Connect (see §5)
  createdAt
```

### New: `Membership` (links people to businesses with a role)
This is the key addition. A person's Google login is **global** — but their
relationship to any given business (are they the owner? the instructor? a
player who's booked lessons there?) is per-business. Someone could plausibly
be a player at one golf business and never interact with another.

```
Membership
  id
  userId       -> User
  businessId   -> Business
  role         // "owner" | "instructor" | "player"
  createdAt

  @@unique([userId, businessId])
```

### Every existing table gets a `businessId`
`Availability`, `Booking`, `Package`, `Note`, `SyncLog` all need a
`businessId` field added, with all uniqueness constraints and queries updated
to include it. For example, `Availability`'s current unique constraint
(`serviceType + startTime`) becomes (`businessId + serviceType +
startTime`) — otherwise two businesses' Tuesday 9am slots would collide.

### `User` stays mostly as-is
Keeps identity (`name`, `email`, `image`) and the Google Calendar
`refreshToken`. Role moves out of `User` and into `Membership`, since role is
now business-specific, not global.

---

## 3. Routing

Every URL needs to carry *which business* it's for. The practical options:

- **Path-based** (`yourapp.com/tee-to-green/book`) — simplest to build, works
  immediately on any hosting setup, no DNS changes. **Recommended for v1.**
- **Subdomain-based** (`teetogreen.yourapp.com/book`) — looks more
  professional/white-label, but needs wildcard DNS + wildcard SSL cert
  configured on your host. Worth doing later once you have real customers who
  care about branding.

A middleware layer reads the slug from the URL, looks up the `Business`, and
makes it available to every page and API route — this becomes the thing
every query filters by.

---

## 4. Authorization changes

Right now, "is this person the instructor?" is a single global check. It
becomes: "does this person have an `instructor` (or `owner`) `Membership` for
*this specific business*?" Every API route that currently checks
`session.user.role === "instructor"` needs to instead check membership scoped
to the business in the URL. This touches essentially every route we've built
— mechanical work, but it's also the most security-sensitive part: getting
this wrong means one business could see or modify another's data.

---

## 5. Payments — Stripe Connect

This is the biggest external-integration change. Right now, your Stripe
account processes every charge. In multi-tenant, **each golf pro needs to
receive their own money** — you don't want to be collecting other people's
revenue and manually paying it out.

The standard solution is **Stripe Connect**: you become a "platform," each
business goes through a one-time Stripe onboarding flow (bank details, tax
info — Stripe hosts this UI, you don't build it), and gets their own
connected Stripe account. Checkout sessions then get created *on behalf of*
that business's account, so money flows directly to them. You can optionally
take a small platform fee automatically on each transaction if you want a
revenue share instead of a flat license fee.

This is real integration work — OAuth-style connect flow, webhook changes to
route by account, and a bit of Stripe-specific learning if you haven't used
Connect before.

---

## 6. Google Calendar

Good news: this needs the least rework. The OAuth flow is already per-user
(`app/api/calendar/connect` sends *whoever clicks it* through their own
Google consent). It mainly needs:
- The stored refresh token conceptually tied to a `Membership` (instructor +
  business pair) rather than just `User`, in case someone ever instructs at
  more than one business.
- The two-way sync cron job updated to loop over **all businesses** with a
  connected calendar, instead of assuming one.

---

## 7. New: business onboarding flow

This doesn't exist today and needs to be built from scratch — the signup
experience for a new golf pro:
1. Sign in with Google
2. "Create your business" — name, choose a slug, set hours/rate
3. Connect Stripe (via Connect onboarding)
4. Connect Google Calendar
5. Set package/fitting pricing
6. Done — their booking page is live at `yourapp.com/{slug}/book`

---

## 8. Rough effort estimate

| Area | Effort |
|---|---|
| Schema redesign + migration | 1–2 days |
| Updating every API route for tenant scoping | 2–3 days |
| Path-based routing + middleware | 1 day |
| Authorization rework (membership-based) | 1–2 days |
| Business onboarding flow (new UI) | 2–3 days |
| Stripe Connect integration | 2–4 days |
| Google Calendar sync updates | 0.5 day |
| Testing data isolation between tenants | 1–2 days (critical, don't skip) |
| **Total** | **~2–3 weeks** of focused work |

Subdomain routing and a proper admin/superadmin view (for you to manage all
businesses) would be additional scope on top of this if wanted later.

---

## 9. Suggested build order

1. Schema + migration (foundational, everything else depends on it)
2. Membership-based auth on a couple of core routes as a proof of concept
3. Path-based routing
4. Roll tenant-scoping through the remaining routes
5. Business onboarding flow
6. Stripe Connect
7. Full data-isolation testing pass before onboarding a real second business

---

## 10. What stays exactly the same

- The booking calendar UI, package/fitting logic, notes system, instructor
  dashboard — none of this changes visually or behaviorally. This is a
  backend/data-model rebuild, not a redesign.
- The two-way calendar sync logic itself is unchanged, just re-scoped.
