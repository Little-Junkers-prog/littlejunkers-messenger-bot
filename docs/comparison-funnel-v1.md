# Comparison Funnel V1 — Build Contract

**Target:** `compare.littlejunkersllc.com`
**Repo:** `Little-Junkers-prog/littlejunkers-messenger-bot`
**Branch:** `feat/comparison-funnel-v1`
**Depends on:** draft PR #36 (`feat/comparison-public-api-v1`)

## Product boundary

The comparison experience is a separate customer-facing funnel within the existing Little Junkers public funnel application. It is not an Odoo page and it must not become a second pricing system.

- `littlejunkersllc.com` = marketing / SEO
- `compare.littlejunkersllc.com` = market comparison / lead acquisition
- `book.littlejunkersllc.com` = transaction / booking
- `admin.littlejunkersllc.com` = operations

The comparison subdomain must be `noindex, nofollow` and excluded from sitemap generation. Competitor intelligence must not be server-rendered into crawlable Little Junkers marketing pages.

## Brand system

Use the April 2026 Little Junkers tokens exactly:

- Signature Pink: `#FFCEE4`
- Dark Hero: `#1E1C19`
- Page Background: `#EDEAE4`
- Surface Background: `#FAF8F5`
- Ink — Primary: `#1A1A1A`
- Warning Background: `#FFF8EB`
- Warning Border: `#F2CF7A`
- Font stack: `system-ui, -apple-system, sans-serif`
- Container radius: `12px` / `16px`
- Never use purple, blue, or green for CTA actions.

Reuse the existing funnel's header/logo/brand behavior where practical rather than creating another visual system.

## V1 customer flow

### Step 1 — Location

Prompt: **Where do you need a dumpster?**

Input label: **City or ZIP**

Accept either a supported city name or ZIP. Current launch markets:

- Peachtree City / 30269
- Fayetteville / 30214
- Newnan / 30263

Do not require customers to know their ZIP. Resolve city input to the canonical market ZIP before querying the comparison API.

Primary CTA: **Continue**

### Step 2 — Comparison size

Prompt: **What size dumpster do you need?**

Choices:

- 11 Yard — small projects / dense debris
- 16 Yard — medium cleanouts / renovations
- 21 Yard — larger renovations / cleanouts

The selected Little Junkers size defines the comparison class. Competitor cards must always display the competitor's actual size. Never relabel a 15-yard competitor container as 16-yard.

### Step 3 — Market preview

Show enough information to prove the comparison is real before asking for contact information.

Example content:

- `We found 6 providers in Peachtree City`
- `4 publish prices online · 2 require a quote`
- provider name / logo
- actual sizes that map to the selected comparison class
- status such as `Publishes pricing` or `Requires a quote`

Do **not** reveal the full price / duration / included-weight comparison yet.

Primary CTA: **See Prices & Details**

### Step 4 — Unlock comparison

Required fields:

- first name
- mobile number

Optional:

- email

Marketing consent is separate from access to comparison results. Unlocking the comparison must not silently create marketing consent.

If a marketing checkbox is shown, it must be optional and record consent proof separately from the comparison unlock event.

Primary CTA: **Show Me the Comparison**

### Step 5 — Full comparison

The root result surface remains compact and mobile-first. One summarizing card per provider; no wide comparison table.

Card fields:

- provider name/logo
- actual dumpster size
- published price OR `Price requires quote`
- rental duration when verified
- included weight when verified
- last verified date

Unknown values must not be converted to zero or silently implied. Use clear language such as `Not published`.

Little Junkers may use Signature Pink branding and the primary **Book Online** CTA, but ordering must not falsely imply an unsupported ranking.

### Step 6 — Provider detail sheet

Tap `View details` to open a bottom sheet / drawer with:

- actual size
- price qualifier
- rental duration
- included weight
- extra-day fee
- overweight fee
- delivery status
- pickup status
- disposal status
- taxes if verified
- booking method
- source / verification date

Competitor outbound CTA: **Visit Provider**

Record the outbound click before redirecting.

### Step 7 — Little Junkers handoff

`Book Online` must hand the customer into `book.littlejunkersllc.com` with known comparison context preserved where safe:

- city / ZIP
- selected Little Junkers size
- comparison session identifier

Do not ask the customer to re-enter known market/size context unnecessarily.

## Data contract

### Little Junkers

Little Junkers pricing continues to resolve from the canonical Supabase-backed pricing service at request time. Never copy Little Junkers prices into competitor tables.

### Competitors

Competitor truth is the canonical:

`Provider → Product → Variant → Observation`

Public comparison receives only current, customer-safe observations selected by the server-side comparison service. Internal market intelligence can use the same canonical observation history with richer evidence.

## V1 provider roster

Current researched roster:

- EZ Disposal Roll Offs
- Moreira's Service
- BM Dumpster Rentals
- Kraken Dumpsters
- Haul Away Dumpsters
- Frank's Roll Off Dumpsters
- Liberty Waste Services of Coweta
- Lucky Dumpster Rentals
- Bin There Dump That – Atlanta

Quote-only / non-itemized providers remain visible when serviceability is verified. Do not remove a real market participant merely because they do not publish a comparable dollar amount.

### Bin There Dump That rule

The live BTDT franchise locator confirmed the **Atlanta** franchise serves Peachtree City, Fayetteville, and Newnan. Atlanta East / Atlanta North pricing must not be substituted for these markets.

The Atlanta franchise does **not** publish a verified itemized per-size dollar price on its primary customer path. The secondary-domain `$400–$485/week` figure is not size-itemized and remains internal unless separately reverified and approved for public use. Customer-facing BTDT cards should therefore show actual 10/15/20-yard comparable products with **Price requires quote** rather than inventing a per-size price.

## Tracking / event model

V1 should capture the customer journey server-side so the comparison tool can later support conversion and pricing analysis.

Minimum events:

- `comparison_started`
- `comparison_location_resolved`
- `comparison_size_selected`
- `comparison_preview_viewed`
- `comparison_unlocked`
- `comparison_provider_detail_viewed`
- `comparison_provider_outbound_clicked`
- `comparison_lj_booking_clicked`

Associate events to a non-PII comparison session identifier before lead capture. After unlock, associate the same session to the captured customer/contact record through server-side logic.

Do not build automated remarketing campaigns in V1. Capture clean consent + behavioral evidence now; campaign automation is deferred.

## Search / SEO controls

The comparison surface must ship with:

- `<meta name="robots" content="noindex,nofollow">`
- canonical / sitemap behavior that does not expose competitor result pages as Little Junkers SEO content
- no static generation of competitor/city pages intended for organic indexing

## V1 implementation sequence

1. Finish / verify comparison API and canonical competitor observations.
2. Add comparison session + event capture server boundary.
3. Build `/compare` preview route using the approved funnel flow.
4. Wire city-or-ZIP normalization.
5. Wire market preview from real comparison data.
6. Wire unlock / contact capture with consent kept separate.
7. Wire full comparison + detail sheet.
8. Wire outbound-click tracking and LJ booking handoff.
9. Point `compare.littlejunkersllc.com` to this surface and verify noindex behavior.
10. Mobile production smoke test before launch.

## Explicitly out of V1

- automated competitor scraping
- automated repricing alerts
- autonomous competitor research
- automated remarketing campaigns
- public SEO comparison landing pages
- customer reviews / subjective ratings
- provider self-service login
- Provider Directory (separate parked item)
- repository rename (parked separately)
