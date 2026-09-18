# Holiday Light Guys — Estimator

Internal, hidden tool for preparing Christmas light installation estimates from Workiz leads.
A lead comes in (pasted manually, or automatically via webhook), the app loads BOTH a real
Street View photo (for display/export) and a top-down aerial image (for exact scale) from one
address lookup. AI suggests roofline/pathway lines on the real photo, and separately matches a
real feature (like the front wall) between the two images so the aerial's exact scale can be
imported into the street-level photo — a human reviews and confirms everything, then exports a
marked-up PNG or branded PDF to upload into Workiz.

Matches the actual workflow described by the business owner: **the final image is still
uploaded into Workiz manually** — this tool automates everything up to that point, not
past it.

See **Current limitations** below before relying on this for real customer estimates.

---

## Tech stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS (Holiday Light Guys brand colors baked into `tailwind.config.ts`)
- Canvas drawing: Konva.js via `react-konva`
- PNG/PDF export: `jsPDF`
- AI line suggestion: OpenAI's vision-capable chat completions API (`gpt-4o-mini`)
- Draft storage: a JSON file on the server (see **Draft storage** below — read the caveat
  if you plan to deploy this somewhere serverless)
- All third-party API calls (Google Maps, OpenAI) happen server-side in API routes —
  no API keys are ever sent to the browser.

---

## 1. Install dependencies

Requires Node.js 18.18+ (Node 20 LTS recommended).

```bash
npm install
```

## 2. Create your `.env.local` file

```bash
cp .env.local.example .env.local
```

Then edit `.env.local`:

```
GOOGLE_MAPS_API_KEY=
OPENAI_API_KEY=your_real_key_here
NEXT_PUBLIC_APP_NAME=Holiday Light Guys Estimator
WORKIZ_WEBHOOK_SECRET=some_random_string
```

**Which keys are actually needed, and which are optional:**

- **`GOOGLE_MAPS_API_KEY`** — OPTIONAL. If set, the property image defaults to a Google
  satellite/aerial view with automatically computed scale (same zero-manual-input behavior as
  the free path below, just from Google instead). Uncheck "Aerial view" in the Property Image
  card to get an actual Google Street View photo instead — but that always requires manual
  scale calibration; a flat street-level photo has no depth data to compute scale from
  automatically. Requires a Google Cloud project with billing enabled. **If left blank**, the
  app automatically falls back to free, keyless services instead: OpenStreetMap's Nominatim
  for address lookup, and Esri's free World Imagery service for the aerial image — same
  automatic scale, no account, no card, no project needed.
- **`OPENAI_API_KEY`** — REQUIRED for AI line suggestion to actually do anything (both the
  "Suggest Lines with AI" button and the automated webhook intake use it). Requires an OpenAI
  account with billing enabled. Without it, the app still works fully — you just draw every
  line manually instead of getting an AI-suggested starting point.
- **`WORKIZ_WEBHOOK_SECRET`** — OPTIONAL but recommended once this is reachable from the
  internet. Protects the automated intake endpoint (`/api/workiz-webhook`) from randoms
  creating fake drafts. See **Automated lead intake** below.
- **`WORKIZ_API_TOKEN`** — OPTIONAL, unused. Placeholder only — see note on Workiz push-back
  in Current limitations.

`.env.local` is already in `.gitignore` — it will never be committed.

## 3. Run locally in VS Code

```bash
npm run dev
```

Visit `http://localhost:3000` for the dashboard, or `http://localhost:3000/estimator`
for the main tool. The page metadata sets `robots: noindex, nofollow` since this is
meant to stay internal/hidden — add real auth before deploying anywhere public-facing.

## 4. How to push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Holiday Light Guys estimator MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/holiday-light-guys-estimator.git
git push -u origin main
```

**Do not commit `.env.local`** — it's already gitignored.

---

## Automated lead intake

This is the piece that turns "an email comes in" into "a draft is ready to review" with no
manual paste step. Point one of these at `/api/workiz-webhook`:

- **An email-forwarding/parsing service** (e.g. SendGrid Inbound Parse, Mailgun Routes) set
  up to receive mail sent to whatever address leads currently arrive at. These services POST
  the raw email body as form fields (`text`, `body`, or `body-plain` depending on provider) —
  the webhook recognizes any of those and parses it with the same logic as the manual
  "Paste Workiz Lead" box.
- **Workiz's own webhook feature**, if/when confirmed available on this account. Once you know
  its real payload shape, update `mapWorkizPayloadToLead()` in `src/services/workiz.ts` to
  match it directly instead of relying on the raw-email-text fallback.

When a lead comes in, the webhook automatically:
1. Parses the lead fields (name/phone/email/address/message/color)
2. Geocodes the address and loads a property image (Street View or the free aerial fallback)
3. Asks AI to suggest roofline/pathway lines based on the customer's message
4. Saves the whole thing as a draft

A human then opens the **Estimator** page, picks that draft from the dropdown in the header
(click **Refresh** if it doesn't show up yet), reviews/edits the AI-suggested lines, confirms
scale calibration, and exports — exactly the same review step as if they'd built it by hand.
**Nothing is ever sent to a customer or to Workiz automatically.**

If `WORKIZ_WEBHOOK_SECRET` is set, whichever service calls this webhook must send it back as
an `x-webhook-secret` header, or the request is rejected.

---

## How the pieces fit together

| Feature | Where |
|---|---|
| Dashboard / landing page | `src/app/page.tsx` |
| Main estimator tool | `src/app/estimator/page.tsx` |
| Drafts dropdown (open auto-created or saved drafts) | `src/components/DraftsInbox.tsx` |
| Paste & parse Workiz lead text (manual path) | `src/components/WorkizLeadInput.tsx`, `src/lib/parseWorkizLead.ts` |
| Automated lead intake (webhook path) | `src/app/api/workiz-webhook/route.ts`, `src/services/workiz.ts` |
| Customer/job form | `src/components/LeadForm.tsx` |
| Address validation + property image (shared by manual button & webhook) | `src/app/api/geocode/route.ts`, `src/app/api/property-image/route.ts`, `src/lib/geocode.ts`, `src/lib/propertyImage.server.ts` |
| AI line suggestion (shared by manual button & webhook) | `src/app/api/ai-suggest-lines/route.ts`, `src/lib/aiSuggest.server.ts` |
| Roofline/pathway drawing canvas | `src/components/DrawingCanvas.tsx` |
| Scale calibration & footage math | `src/lib/measurement.ts` |
| Pricing | `src/lib/pricing.ts` |
| PNG/PDF export | `src/components/ExportPanel.tsx`, `src/lib/pdfExport.ts` |
| Draft storage (server-side JSON file) | `src/lib/storage.ts` (client), `src/lib/draftsStore.server.ts` (server), `src/app/api/drafts/*` |
| Real county assessor photo (Johnson County, KS only) | `src/lib/countyPhoto.server.ts` |

---

## Real property photos from county records (Johnson County, KS)

Before falling back to Google Street View, the app tries to pull an actual elevation photo
straight from Johnson County, Kansas's public assessor GIS system
(`ims.jocogov.org/locationservices`) — these are often better than Street View: taken
specifically for the building (sometimes multiple angles), dated, and updated periodically by
the County Appraiser's office.

**How it works:** `src/lib/countyPhoto.server.ts` uses Puppeteer — a real, headless Chromium
browser — to load that site, type in the address, click the matching result, and pull the
photo URL straight out of the page. This was built against real, manually-verified selectors
on the live site (not guessed), but it's worth understanding exactly what kind of thing this
is before relying on it:

- **This is browser automation of a public government website, not an official API.** Johnson
  County has no documented API for this — they explicitly offer paid "Data Subscription" /
  "Data Licensing" programs (see `aims.jocogov.org/ProductsAndServices`) for anyone wanting
  durable, sanctioned access. If this sees real production use, contacting their GIS office
  (`mapper@jocogov.org`, 913-715-1600) about a proper data license is the responsible
  long-term path — this scraper is a working stopgap, not a replacement for that conversation.
- **It clicks through the site's own "I agree to these terms" dialog automatically, every
  run.** That doesn't change what's actually being agreed to — whoever relies on this in
  production should actually read that agreement in full (only partially reviewed while
  building this).
- **Johnson County, KS and Jackson County, MO — that's it, for now.** Any other county in
  either state simply finds nothing and falls through to Street View/aerial, exactly as before.
- **Jackson County's flow has an extra fragile piece.** Its small "BASIC INFORMATION" popup is
  rendered inside a *closed shadow root* — a browser feature that makes its contents completely
  inaccessible to any script, Puppeteer included. There is no selector that can reach the
  button inside it. The only way in is a coordinate-based mouse click at its on-screen pixel
  position (verified stable, but only at the exact viewport size the code sets). If Jackson
  County ever changes that popup's layout, this breaks in a way no selector fix can address —
  only new coordinates found by re-testing by hand.
- **It's slow** — launching a real browser takes several real seconds, on top of the normal
  geocode/image fetch time. `src/lib/propertyImage.server.ts` only attempts this for addresses
  that look Kansas-based (a quick text check, not a guarantee) specifically to avoid paying
  that cost on every Missouri address.
- **It needs a real server, not serverless/edge hosting** — Puppeteer launches an actual
  Chromium binary, which needs a normal Linux/Mac/Windows environment to run in.
- **It's fragile by nature.** If Johnson County changes their page's structure, this breaks
  until the selectors in `countyPhoto.server.ts` are updated to match.

`npm install` will download Puppeteer's bundled Chromium (roughly 300MB) — expect that install
step to take noticeably longer than the rest.

---

## Measurement approach (read this before trusting any number)

Footage is **never blindly trusted from AI**. The flow is:

1. Loading a property fetches TWO images from one address lookup:
   - The **real Street View photo** — what's displayed, drawn on, and exported.
   - A **top-down aerial image** — fetched purely for its scale, which is mathematically
     exact (derived from a known zoom level and geography — no guessing involved). This
     image itself is never shown; it's a reference input only.
2. AI does two things at once when it looks at the Street View photo:
   - Suggests roofline/pathway lines (as before).
   - Tries to find ONE real feature — the front wall, a garage width, a driveway — that it
     can confidently identify in BOTH the Street View photo and the aerial image. If it
     finds a match, the server computes that feature's real-world length directly from the
     aerial's exact scale (a calculation, not something AI states), then uses that exact
     number to calibrate the Street View photo. The UI shows this with an amber notice:
     *"Scale matched from an exact aerial measurement of [feature] — the number is exact,
     only the photo-matching is AI's judgment."*
   - If no confident match is found (object blocked, ambiguous, or the aerial image wasn't
     available), it falls back to guessing a standard object's typical size directly in the
     photo (a two-car garage ≈ 16 ft, etc.) — a genuine assumption, flagged with a red
     warning instead, since this one really is just a guess.
3. **Manual calibration** is always available regardless of what happened above: click two
   points spanning a distance you actually know, type it in, and that overrides anything
   AI produced. Use this whenever a suggested reference looks wrong.
4. Draw lines on top of the image. Each line's footage is calculated from its pixel length
   divided by whichever scale is currently active.
5. Every line has a **manual override** field — if filled in, it wins over the calculated
   value for both display and pricing (`src/lib/pricing.ts:getBillableFeet`).
6. AI can only ever *suggest* line placement — suggested lines land on the canvas exactly like
   manually-drawn ones and must be reviewed/edited before export.
7. Every PDF export and the on-screen summary carry this line:
   *"Measurement is an estimate and should be verified during installation."*

**Being honest about all of this:** even the "exact" cross-reference path depends on AI
correctly matching the same physical feature across two very differently-angled photos — that
match itself can be wrong even though the resulting math is exact once a match is found. And
if Street View simply has no coverage at an address, the aerial image becomes the display image
directly, with its exact scale applied with no AI step needed at all — that case is the one
place this really is fully certain. Nothing here replaces a human glancing at the number before
trusting it.

## Pricing

`src/lib/pricing.ts` currently assumes **new-installation pricing at $6.50 per linear foot**,
billed against whichever footage value (calculated or manually overridden) ends up on each
line, plus a tax rate that defaults to 0%.

**Before relying on this for real quotes:**
- Confirm the $6.50/ft figure against the current pricing actually published on the
  Holiday Light Guys website — it was entered as a best-guess, not pulled from a live source.
- Confirm billing is really per linear foot of drawn line, not per square foot of roof
  coverage or a flat/tiered structure — if it's different, update
  `calculateEstimatePricing()` in `src/lib/pricing.ts`.
- Set a real `taxRate` for your jurisdiction in the same file.

---

## Draft storage — important caveat

Drafts are stored in a JSON file at `data/drafts.json` on the server (gitignored, never
committed). This is a real, working, shared store — anyone opening the Estimator page sees
the same drafts, including ones the webhook created automatically.

**However**: this only persists reliably on an always-on server (a VPS, a traditional Node
host, running `npm start` continuously). If this is ever deployed to a serverless platform
like Vercel, the filesystem is not guaranteed to persist between requests or deploys — drafts
could silently vanish. Swap `src/lib/draftsStore.server.ts`'s internals for a real database
(Supabase/Firebase/etc.) before relying on this in that kind of deployment; every function it
exports is already async with a stable signature so nothing else would need to change.

---

## Current limitations

- **Draft storage isn't durable on serverless hosting** — see above. Fine for an always-on
  server or local use; needs a real database before a serverless deploy.
- **Workiz's real webhook payload shape isn't confirmed.** `mapWorkizPayloadToLead()` in
  `src/services/workiz.ts` currently handles raw forwarded email text (works today with any
  email-parsing service) and a best-guess structured shape. If Workiz's own webhook feature
  turns out to send something different, update that one function to match.
- **Pushing the finished estimate back into Workiz automatically is intentionally NOT
  built.** Confirmed directly by the business owner: the marked-up image is uploaded into
  Workiz manually by whoever reviews the estimate. `pushEstimateToWorkiz()` in
  `src/services/workiz.ts` throws on purpose — it's there only in case that ever changes.
- **AI suggestion costs money per request** once `OPENAI_API_KEY` is set (small, per-call —
  but not literally free like the rest of the app can be).
- **Street View coverage isn't universal**, and the free aerial fallback is an overhead view,
  not a front-of-house photo. Neither is guaranteed to clearly show the actual roofline —
  manual photo upload as a fallback isn't built yet.
- **No authentication.** The page is marked `noindex, nofollow` but nothing prevents someone
  with the URL from opening it. Add real auth before deploying anywhere reachable from
  outside your team. The webhook has its own separate protection (`WORKIZ_WEBHOOK_SECRET`).
- **Server-side PDF export route is a placeholder.** PDF generation happens client-side
  (`src/lib/pdfExport.ts`) so it can embed the canvas's rendered image directly.

## Future improvements

- Confirm Workiz's real webhook payload shape and wire it in directly, if/when available,
  instead of relying only on forwarded-email parsing.
- Manual photo upload fallback when Street View/satellite imagery is poor or unavailable.
- Real database-backed draft storage if this ever needs to run somewhere serverless.
- Basic auth/login gate.
- Support for multiple photos per property (front + side angles) on one estimate.
