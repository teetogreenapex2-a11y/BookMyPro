# BookMyPro — Web App

A real, deployable, multi-tenant web app for coaches and instructors to sell
lessons and fittings — live Google Calendar sync, Stripe/Square payments, a
shop, gift cards, and more. Built with Next.js (App Router), Prisma, NextAuth,
Stripe, and the Google Calendar API.

This codebase is the platform itself (like Shopify or Squarespace) — each
business that signs up (e.g. the "Tee to Green Golf" example data used
throughout local development) gets its own branded booking page, team, and
pricing, all running on this one shared app.

This picks up from the design/flow validated in the interactive prototype —
same pricing, same booking rules, now wired to real services.

---

## What's real here

- **Auth**: Google sign-in for both players and the instructor (NextAuth)
- **Payments**: Stripe Checkout for lesson packages and club fittings
- **Calendar sync**: confirmed bookings create real events on the instructor's
  calendar (Google or Outlook — each business picks one in Settings); cancellations remove them
- **Booking approval** (optional, on by default): new bookings are held as
  "pending" until the instructor confirms or denies them — Google Calendar
  sync happens at confirm time, not at request time, so nothing unapproved
  shows up on the real calendar. Toggle it off in Settings → Business to go
  back to instant confirmation.
- **Booking notification emails** (optional, off by default): the instructor
  can turn on an email alert for every new booking — both instant
  confirmations and pending requests — sent via Resend to whichever address
  they choose in Settings.
- **Database**: Prisma ORM — SQLite for local dev, swap to Postgres for production

## What you still need to do

1. Create Google Cloud OAuth credentials
2. Create a Stripe account and get API keys
3. Pick a hosting platform (Vercel is the easiest fit for Next.js)
4. Deploy, then set Rick's account role to "instructor" in the database

---

## 0. ⚠️ Multi-tenant migration — fully complete (including subdomain routing)

This codebase has been migrated from single-business to multi-tenant (see
`multi-tenant-scoping.md` for the full plan). Current status:

**Done:**
- **Schema** — `Business` and `Membership` models, every business-scoped table
  (`Availability`, `Booking`, `Package`, `SyncLog`) has a `businessId`.
  `BusinessSettings` no longer exists (renamed fields: `businessName` → `name`,
  `businessEmail` → `email`, `businessHours` → `hours`, now on `Business`).
- **`lib/tenant.ts`** — core helpers: `getBusinessBySlug`, `getMembership`,
  `requireMembership`, `getBusinessInstructor`, `ensureMembership`.
- **Path-based routing** — every page lives under `app/[slug]/` and every
  API route under `app/api/[slug]/`, all scoped by business.
- **Every route converted**: `availability`, `bookings` (+ cancel), `packages`
  (+ checkout), `fittings/checkout`, `notes`, `business`, `calendar/connect`,
  `calendar/sync`, `calendar/sync-log`. Each checks `Membership`-based roles
  and scopes every query by `businessId` — verified with a full sweep for any
  remaining old single-business patterns.
- **Google Calendar OAuth** — the connect flow now carries the business id
  through as the OAuth `state` param (`/api/{slug}/calendar/connect` →
  `/api/calendar/callback`, which stays at one fixed URL since that's what's
  registered in Google Cloud Console — but resolves the right business from
  `state` and stores the token on that business's `Membership`).
- **Stripe webhook** — stays at one fixed URL too (Stripe webhooks are
  per-endpoint), but every checkout session now carries `businessId` in its
  metadata so the webhook always routes events back to the right business.
- **Scheduled sync** — moved to `app/api/cron/calendar-sync`, which loops
  over every business with a connected calendar (`syncAllBusinesses()` in
  `lib/calendarSync.ts`), instead of assuming a single instructor.

- **Stripe Connect** — each business gets its own Express account
  (`app/api/{slug}/stripe/connect`) via Stripe's hosted onboarding. Package
  and fitting checkouts are created as *direct charges* on the business's
  connected account (using the `stripeAccount` request option), so money
  goes straight to them — the platform never touches it. Checkout is blocked
  with a clear error until the business finishes onboarding
  (`charges_enabled` on their account). Settings → Business shows live
  connection status with a "Connect Stripe" / "Finish Stripe setup" button.
- **Subdomain routing** — `middleware.ts` transparently rewrites
  `{slug}.yourdomain.com/book` to the existing `/[slug]/book` route (and
  `{slug}.yourdomain.com/api/...` to `/api/[slug]/...`) with zero changes to
  any page or route file. Path-based URLs keep working simultaneously and
  automatically as the fallback — nothing breaks if `NEXT_PUBLIC_ROOT_DOMAIN`
  is unset, which is the default. See §8 below for enabling it.

**Not yet done:**
- A platform fee — Stripe Connect direct charges support this optionally
  (`application_fee_amount` in the checkout session) if you want to take a
  cut of each transaction instead of a flat license fee. Not wired up, but
  the integration point is `app/api/[slug]/packages/checkout/route.ts` and
  `fittings/checkout/route.ts`.

**Practical result:** the full loop now works — a new golf pro signs up at
`/onboarding` (a 4-step wizard: business basics, their own pricing, optionally
adding other instructors, and optionally connecting Google/Outlook right
there — each step after the first is skippable and can be finished later in
Settings), connects their own Stripe account in Settings, and their business
is completely live and isolated from every other business on the platform,
reachable at a clean URL of their own (subdomain or path, your choice). This is genuinely ready to sell to a
second customer, pending real production infrastructure (hosted Postgres,
production Stripe/Google credentials — see §4).

See `multi-tenant-scoping.md` for the full build plan.

## 1. Local setup

```bash
npm install
cp .env.example .env
# fill in .env — see "Getting your credentials" below
npx prisma db push
npm run dev
```

Visit `http://localhost:3000`, sign in, and go to `/onboarding` to create
your business — that one flow creates the Business, your "owner" account,
and seeds your own availability, so there's no separate seed step needed.

> **On schema changes:** this project doesn't carry a migration-file
> history — `prisma/schema.prisma` is the single source of truth, kept
> current with every feature added (multi-instructor support, per-instructor
> pricing and availability, the configurable booking window, remote/video
> lessons, swing video review, Swing Sketch, the shop, gift cards, the Find
> a Pro directory, and everything before that). Whenever you pull a newer
> version of this project, just run `npx prisma db push` again to sync your local
> database to match — it's idempotent, so running it when nothing's
> changed is a harmless no-op.
>
> **The one exception — this one genuinely needs a fresh database, not
> just a sync:** if your local database predates per-instructor
> availability, `Availability.instructorMembershipId` is a required field
> with no default, since every slot now belongs to a specific instructor
> rather than the business as a whole, and there's no way to infer that
> for old rows. If `db push` complains about this, run `npx prisma migrate
> reset` (wipes your local database), then `db push`, then go through
> `/onboarding` again.
>
> **Note on Swing Sketch specifically:** this is deliberately a separate
> feature from swing video review, not a variant of it — one is a player
> submitting a clip for comments, the other is an instructor actively
> drawing on a still photo (lines, angles, arrows, labels), usually live
> in a lesson. They share the storage approach (Vercel Blob) but nothing
> else. The drawing canvas (`components/SwingCanvas.tsx`) saves both a
> flattened PNG *and* the raw shape data as JSON, so a sketch can be
> reopened and kept editing rather than being a flat image forever.
>
> **Note on the shop and gift cards specifically — real scope decisions,
> not oversights:** products support one price plus optional lightweight
> variants (size, flex, etc.) that differ only by label and stock count,
> not per-variant pricing — good enough for how a single-location pro
> shop actually sells, not a full multi-price variant matrix. There's no
> tax calculation; if you need to collect sales tax, that's a real gap to
> close before relying on this for taxable sales. Stock is reserved the
> moment an order is placed (not when payment completes) and restored if
> the order is later cancelled — the safer failure mode for limited
> inventory, at the cost of a checkout that's abandoned mid-payment
> holding stock hostage for a bit. Gift cards are a stored balance, not a
> fixed voucher — a $50 card can be partially spent across more than one
> purchase — and can currently be redeemed at shop checkout; wiring
> redemption into lesson/package booking too is a reasonable next step,
> not yet built.
>
> Also run `npm install` after pulling this version — it adds `@vercel/blob`
> as a new dependency for the swing-video upload feature.
>
> **Note on per-instructor pricing specifically:** this replaced
> business-wide package/fitting pricing with per-instructor pricing.
> Existing businesses with one instructor won't notice a difference (that
> instructor's pricing starts from the same defaults the business-wide
> settings used to have), but if you had customized business-wide prices
> before this change, you'll need to re-enter them under that instructor's
> own pricing in Settings — they don't carry over automatically.
>
> **Note on per-instructor availability and the earlier unified-availability
> change specifically:** both are the "genuinely needs a fresh database"
> exception mentioned above — `Availability.instructorMembershipId` being
> required with no default is the specific reason. If `db push` complains,
> that's what it's about; the reset instructions above are the fix.

## 2. Getting your credentials

### Google OAuth (login + calendar)
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or use an existing one)
3. Enable the **Google Calendar API** (APIs & Services → Library)
4. Create an **OAuth Client ID** (Web application)
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/calendar/callback`
   - (add your production domain versions of both once deployed)
6. Copy the Client ID and Secret into `.env`

### Outlook/Microsoft 365 (optional)
A business can pick Outlook instead of Google Calendar from **Settings →
Business → Calendar**. Setup on your end:

1. Go to [Azure Portal → App registrations](https://portal.azure.com) → **New registration**
2. Under **Supported account types**, choose "Accounts in any organizational
   directory and personal Microsoft accounts" — this lets both work/school
   365 accounts and personal Outlook.com accounts sign in, which matters
   since you won't know in advance what kind of account each instructor uses.
3. Add a **Web** platform redirect URI:
   `http://localhost:3000/api/calendar/outlook/callback` (add your
   production domain's version once deployed)
4. Under **Certificates & secrets**, create a new client secret — copy it
   immediately, Azure only shows it once
5. Copy the **Application (client) ID** and the secret into
   `OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_SECRET`
6. No API-enabling step needed beyond this — Microsoft Graph's calendar
   endpoints are available by default once the app has the right scopes
   (already requested in code: `Calendars.ReadWrite`, `offline_access`)

**Worth knowing:** Microsoft Graph access tokens expire in about an hour and
have to be actively refreshed and re-saved (unlike Google, where the client
library handles this from just a refresh token) — `lib/calendar.ts` does
this automatically on every calendar call, refreshing early if a token is
close to expiring. Also, like Square, this integration is written correctly
against Microsoft's documented APIs but is newer and less exercised than the
Google path — verify field names against the
[current Graph API reference](https://learn.microsoft.com/en-us/graph/api/resources/calendar)
before relying on it for a real calendar.

### Resend (booking notification emails, optional)
Turned on per-business via **Settings → Business → "Email me about bookings"**.

1. Sign up at [resend.com](https://resend.com), grab an API key from the dashboard
2. Put it in `RESEND_API_KEY`
3. While testing, leave `RESEND_FROM_EMAIL` as `onboarding@resend.dev` — this
   is Resend's shared test domain, no setup needed. **One catch**: emails
   from this address can only be sent *to the email address you signed up
   to Resend with* — if the instructor's notification email is a different
   address, sends will silently fail until you verify a real domain.
4. When you're ready for production, go to **Domains → Add Domain** in
   Resend, add the DNS records they give you, wait for verification, then
   set `RESEND_FROM_EMAIL` to an address on that domain (e.g.
   `notifications@yourdomain.com`) — after that, emails can go to anyone.

### Stripe
1. Sign up at [stripe.com](https://stripe.com), grab your **test** keys from
   the [API keys page](https://dashboard.stripe.com/test/apikeys)
2. Put the secret key in `STRIPE_SECRET_KEY` — this is your **platform** key,
   used to create connected accounts on behalf of businesses (see below); it
   never directly charges anyone once Connect is set up.
3. **Enable Connect**: in the Stripe Dashboard, go to
   [Connect settings](https://dashboard.stripe.com/settings/connect) and
   enable it (Express accounts). No extra keys needed — the platform secret
   key above is used for both.
4. For local webhook testing, install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
   and run: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   — it will print a webhook secret to put in `STRIPE_WEBHOOK_SECRET`.
   The Stripe CLI automatically forwards Connect events too, so this covers
   local dev with no extra setup.
5. **In production**, when you create the webhook endpoint in the Dashboard
   (see §4 step 6), check **"Listen to events on Connected accounts"** —
   this is what makes the one endpoint receive events from every business's
   connected account, using the same signing secret.

Each business connects (or creates) their own Stripe account through
**Settings → Business → Connect Stripe** once they're signed in — there's
nothing more to configure per-business on your end.

### Square (optional)
A business can pick Square instead of Stripe from **Settings → Business →
Payments**. Setup on your end:

1. Create an app at the [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Under OAuth, add the redirect URI: `http://localhost:3000/api/square/callback`
   (add your production domain's version once deployed)
3. Copy the **Application ID** and **Application Secret** into
   `SQUARE_APPLICATION_ID` / `SQUARE_APPLICATION_SECRET`. Leave
   `SQUARE_ENVIRONMENT=sandbox` while developing — Square's sandbox is a
   fully separate test environment with its own fake seller accounts.
4. Under Webhooks, create a subscription for the **`payment.updated`** event
   pointed at `<your-domain>/api/square/webhook`, and copy its signature key
   into `SQUARE_WEBHOOK_SIGNATURE_KEY`.
5. Set up the token-refresh cron job (see §5 below) — unlike Stripe Connect,
   Square access tokens expire every 30 days and need active renewal, or a
   business's payments silently stop working after a month.

**Worth knowing:** the Square integration (`lib/square.ts`) is written
against Square's documented OAuth, Payment Links, and Webhooks APIs, but
Square's API evolves — before taking real payments through it, diff the
implementation against the current [Square API reference](https://developer.squareup.com/reference/square),
particularly the Payment Link/Order field names, since those are the parts
most likely to have shifted since this was written.

### Vercel Blob (swing video uploads)
Powers the video-submission feature (`lib/videoStorage.ts`) — players
upload swing videos, stored here.

1. In your Vercel project, go to **Storage → Create Database → Blob**
2. Vercel generates `BLOB_READ_WRITE_TOKEN` automatically and adds it to
   your project's env vars — for local dev, copy that same value into your
   `.env`
3. That's it — no separate account, no bucket configuration. Videos are
   stored publicly accessible at their Blob URL (not signed/private), which
   is fine for this use case but worth knowing if that ever changes.

### Daily.co (remote video-call lessons, optional per business)
Unlike the integrations above, this isn't a global env var — each business
brings their own Daily.co API key, entered in **Settings → Business →
Remote lessons**. Leaving it blank just means the remote-lesson option
doesn't appear for that business's players; nothing else is affected.

1. Sign up at [daily.co](https://www.daily.co) (they have a free tier)
2. Grab an API key from the dashboard
3. Paste it into Settings for that business

`lib/dailyVideo.ts` calls Daily's REST API to create a room and returns a
plain URL — there's no embedded call UI to maintain; both the player and
instructor just open that URL and Daily's own hosted page handles the
actual call.

## 3. Setting up businesses and roles

**The easy way:** sign in, then visit `/onboarding` (or just go to `/` — if
you're not a member of any business yet, you'll be redirected there
automatically). Fill in a business name, confirm or edit the auto-suggested
URL slug, and submit — this creates the `Business`, makes you its `owner`,
and seeds 4 weeks of open availability. You'll land straight on your new
Instructor page.

**The manual way** (useful for testing multi-tenancy, or granting someone
`instructor` access to a business they didn't create):

```bash
npx prisma studio
```

1. Have the person sign in once (creates their `User` row).
2. Open the `Membership` table → **Add record**.
3. Set `userId` to their user id, `businessId` to the target business's id,
   and `role` to `owner`, `instructor`, or `player`.
4. Save — they'll see the right view on next page load.

Either way, once someone has `owner`/`instructor` access, have them visit
**Settings → Connect Google Calendar** to authorize sync (separate from
login, so players are never asked for calendar permissions).

**Testing that two businesses are actually isolated:**

1. Create a second business via `/onboarding` using a different account (or
   just sign out and back in with a different Google account).
2. Visit its `/{slug}/book` and `/{slug}/instructor` pages — you should see
   a calendar seeded with its own fresh availability, independent pricing
   defaults, and zero visibility into the first business's bookings,
   packages, or notes.

## 4. Deploying (Vercel)

1. Push this repo to GitHub
2. Import it in [Vercel](https://vercel.com/new)
3. Add a **Postgres database** (Vercel Postgres, or bring your own — Supabase/Neon work fine)
   - In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`
4. Add **Vercel Blob** storage (Storage → Create Database → Blob in your Vercel
   project) — powers swing video uploads and Swing Sketch. Vercel generates
   `BLOB_READ_WRITE_TOKEN` automatically once you do this.
5. Set all the environment variables from `.env` in Vercel's project settings
   (use your real production domain for `NEXTAUTH_URL` and the redirect URIs).
   Daily.co is the one exception — it's not a global env var, each business
   enters their own API key in their own Settings once they're live.
6. Update the Google Cloud OAuth client's redirect URIs to include your production domain
7. In Stripe, create a **live** webhook endpoint pointing to
   `https://yourdomain.com/api/stripe/webhook` — check **"Listen to events on
   Connected accounts"** so it receives every business's payment events, not
   just the platform's — get its signing secret, and set
   `STRIPE_WEBHOOK_SECRET` accordingly (switch to live API keys too, when ready)
8. Deploy — Vercel will run `npm run build`, which runs `prisma generate` first
9. Sync the schema to the production database once, from your own machine,
   pointed at the production `DATABASE_URL`:
   `npx prisma db push`
   (This project doesn't carry a migration-file history — schema.prisma is
   the single source of truth, and `db push` syncs the real database to
   match it directly. Simpler, and appropriate at this stage; a real
   migration history is worth setting up later if this grows into something
   with a team of developers or real historical-data compliance needs.)
10. That's it — no separate seed step needed. The first business (yours,
    or your first real customer's) creates its own data by going through
    `/onboarding`, which creates the Business, the owner account, and
    seeds that business's own availability automatically.

## 5. Two-way calendar sync

The app already pushes bookings **out** to Rick's Google Calendar. It can also pull
changes **in**:

- **Blocking**: any event on Rick's Google Calendar that the app didn't create
  (e.g. a personal appointment) will close the matching Availability slot(s) so
  players can't book over it. If that event is later removed, the slot reopens
  automatically — unless Rick had also manually closed it in the app, which always
  takes precedence.
- **Booking from Calendar**: Rick can create a booking directly in Google Calendar
  by titling an event `Book: player@email.com` (add `- Driver fitting`,
  `- Iron fitting`, or `- Full bag fitting` for a fitting; omit it for a lesson).
  On the next sync, if that email matches a real player account and — for lessons —
  they have lesson credits available, a real Booking record is created and the
  slot is marked booked.

### Triggering a sync

- **Manual**: the Instructor page has a "Sync with Google Calendar" button, plus a
  "View sync history" toggle showing the last 15 runs (timestamp, what changed,
  whether it was triggered manually or by a scheduled job, and any errors).
- **Automatic**: set a `CRON_SECRET` in your environment, then configure a scheduled
  job to call `GET /api/cron/calendar-sync?secret=YOUR_CRON_SECRET` periodically
  (every 15–30 minutes is reasonable). This syncs *every* business with a
  connected calendar in one pass. On Vercel, add this to `vercel.json`:

  ```json
  {
    "crons": [
      { "path": "/api/cron/calendar-sync?secret=YOUR_CRON_SECRET", "schedule": "*/15 * * * *" },
      { "path": "/api/cron/square-token-refresh?secret=YOUR_CRON_SECRET", "schedule": "0 6 * * *" }
    ]
  }
  ```

  The second entry keeps Square-connected businesses' tokens fresh (see §2's
  Square section) — once daily is plenty, since it only refreshes tokens
  expiring within the next 8 days.

  (Vercel's free Hobby plan limits cron jobs to once per day — for more frequent
  syncing on Hobby, use an external scheduler like [cron-job.org](https://cron-job.org)
  to hit the same URL instead.)

### Limitations

- Sync only looks 28 days ahead — matches the availability window generated by the seed script.
- Slot matching assumes 60-minute blocks (the app's fixed hourly grid). If you change `TIMES`, update `SLOT_BLOCK_MINUTES` in `lib/calendarSync.ts` to match.
- Bookings created from a calendar tag only work if the player already has an account (has signed in at least once) and, for lessons, has lesson credits available.

## 6. Project structure

```
app/
  book/            Player booking flow
  instructor/       Instructor availability + notes
  settings/          Profile / notifications / business settings
  api/
    availability/    GET slots, PATCH to open/close
    bookings/        POST lesson bookings (uses package credits)
    packages/checkout/  Stripe checkout for lesson packages
    fittings/checkout/  Stripe checkout for club fittings
    stripe/webhook/  finalizes purchases after payment
    calendar/        Google Calendar OAuth connect/callback
    notes/           instructor notes per booking
lib/
  auth.ts            NextAuth config
  prisma.ts           DB client
  stripe.ts           Stripe client
  googleCalendar.ts   Calendar OAuth + event helpers
  pricing.ts          Package and fitting pricing (edit here to change prices)
prisma/
  schema.prisma       Database models
  seed.ts             Generates 4 weeks of open availability slots
```

## 7. Subdomain routing (optional)

By default every business is reachable at `yourdomain.com/{slug}/book` —
this works everywhere with zero setup, including on `localhost`. If you'd
rather each business have its own subdomain
(`{slug}.yourdomain.com/book`), here's what that takes:

**You'll need your own domain** for the platform itself (not each business —
just one, e.g. `teetogreen.app`) with the ability to add DNS records.

1. **DNS**: add a wildcard record pointing at your host —
   `*.yourdomain.com` → (Vercel gives you the exact value when you add the
   domain in the next step; typically a `CNAME` to `cname.vercel-dns.com`
   or an `A` record to Vercel's IP).
2. **Vercel**: in your project's Domains settings, add both `yourdomain.com`
   and `*.yourdomain.com` (the wildcard). Vercel provisions SSL certificates
   for wildcard domains automatically — note this requires a paid Vercel
   plan (Pro or higher); wildcard domains aren't available on the free Hobby
   tier.
3. **Set the env var**: `NEXT_PUBLIC_ROOT_DOMAIN=yourdomain.com` in your
   Vercel project settings (no `https://`, no subdomain, no trailing slash).
4. Redeploy. That's it — `middleware.ts` picks up the env var automatically
   and starts rewriting subdomain requests to the matching business.

**What changes and what doesn't:**
- Every internal link and `fetch()` call in the app already adapts
  automatically (via `getBasePaths()` in `lib/tenant.ts`, threaded through
  every page as `basePath`/`apiBase` props) — a business accessed via
  subdomain gets clean URLs (`/book`, `/api/availability`) with no visible
  slug, while path-based access keeps the slug prefix. Both work
  simultaneously; a business isn't locked into one mode.
- Stripe checkout redirects and the Google Calendar OAuth connect flow both
  detect and preserve whichever mode the request came in through
  (`lib/businessUrl.ts`), so a business using subdomains doesn't get bounced
  back to a path-based URL after paying or connecting their calendar.
- The onboarding flow's post-signup redirect uses the subdomain form
  automatically once `NEXT_PUBLIC_ROOT_DOMAIN` is set.
- `www.yourdomain.com` redirects to the bare root domain rather than being
  treated as a business slug.

**Testing locally:** subdomains don't work on plain `localhost` without
extra `/etc/hosts` entries or a tool like [ngrok](https://ngrok.com), so
local dev is expected to keep using path-based URLs even if
`NEXT_PUBLIC_ROOT_DOMAIN` happens to be set — just leave it blank locally
and only set it in your production environment.

## 8. Known limitations to be aware of

- Only one instructor account is supported (the app looks up `role: "instructor"`
  and assumes a single match). Multi-instructor support would mean adding an
  `instructorId` to Availability/Booking and updating queries accordingly.
- Availability is pre-generated for a fixed 4-week window by the seed script.
  For a real production setup, add a scheduled job (e.g. a Vercel Cron job)
  that generates the next week's slots on a rolling basis.
- SMS reminders and email reminders are stored as preferences but not yet
  sent — wire up a provider like Twilio (SMS) and Resend/SendGrid (email),
  triggered by a scheduled job checking upcoming bookings.
- No admin UI for editing prices — they live in `lib/pricing.ts`. Edit and
  redeploy to change them.
- **Fixed**: earlier versions of this app tracked lesson and fitting
  availability as two parallel timelines (an instructor could theoretically
  have a lesson *and* a fitting booked at the same moment, which isn't
  physically possible for one person). `Availability` is now a single shared
  timeline per business — a slot doesn't belong to a service until something
  actually books it, and the Instructor and Player calendars both color
  booked slots by what they were booked for (fairway green for lessons, gold
  for fittings) rather than showing two separate grids.
- The Square integration is newer and less battle-tested than the Stripe one
  — it's written correctly against Square's documented APIs, but hasn't been
  run against a real payment end-to-end the way the Stripe path has through
  this project's development. Test thoroughly in Square's sandbox before
  trusting it with real money, and see the note in §2 about verifying field
  names against Square's current API reference.
- Same caveat for the Outlook calendar integration relative to Google's —
  see the note in §2's Outlook section.
