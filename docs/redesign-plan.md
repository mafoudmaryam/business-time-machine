# Frontend redesign plan (shipped)

Status: **shipped** (branch `frontend-redesign`). Deviations from the plan: the live "rough estimate" was dropped because the wizard now shows the engine's own month-1 summary instead (two different sales numbers would confuse owners); no "last played" in the header (the current business name is shown instead); no month-name mapping for `start_month`, because a simulation month is not a calendar month; charts use one shared legend above the grid instead of per-chart legends with end values; the result table keeps percentages (it is the "all the numbers" view), while cards use "X of 10 futures". Original status: approved, on hold pending the multi-industry task (café / restaurant /
bakery). Do not implement until that task lands and this doc has been revisited for
industry-specific details (see "Open questions for the industries task" at the
bottom). Visual/UX only — no changes to `api.ts`, the engine, the backend, or any
existing pure function's behavior (`decisionSummary`, `riskAlert`,
`friendlyErrorMessage`). Existing Vitest tests only cover pure functions, not
rendered markup, so they stay green untouched; new pure formatting helpers added
here get their own new tests.

## Decisions locked in (from the plan review)

- **"Last played"** (top bar, right side): no `localStorage`. Fetch
  `GET /businesses/{id}/simulation_runs` for the selected business and show the
  newest run's `created_at` as a relative time (e.g. "Last played: 2 days ago").
  This is a genuinely new API call from the header whenever a business is selected
  — approved as an exception to "no new API calls".
- **Recipe-gated save**: "Save scenario" is disabled until every decision's
  checkbox is confirmed. This is a real behavior change from today (where you can
  save with unconfirmed decisions and only get blocked at simulate-time via the
  409) — approved explicitly.
- **Live revenue hint**: keep it, labelled "rough estimate" so it's never mistaken
  for an engine/simulation number.
- **Industry-aware wording**: wordmark becomes "FOR YOUR BUSINESS" (not "FOR YOUR
  CAFÉ"). Headings use the business's name/industry, e.g. "Tell us about your
  bakery" / "Tell us about your restaurant" / "Tell us about your café", instead of
  a hardcoded café phrase. Photos are sourced per industry (café / restaurant /
  bakery), not café-only.

## 1. Design tokens

- `index.html`: Google Fonts `<link>` for Playfair Display, Montserrat, Great Vibes.
- `index.css`: café-house palette as CSS variables — `--page` #F3EAE1, `--band`
  #EADBCD, `--card` #FAF5EF, `--border` #E2D3C3, `--ink` #2B1D16, `--muted-1` #4A3527,
  `--muted-2` #6F5A4A, `--button` #6B4331, `--button-text` #FBF5EE. Pill or 10px
  radius buttons; cards get a 1px border, 6px radius, no heavy shadows. Verify actual
  WCAG contrast for every text/background pairing while wiring this up and nudge
  `--muted-2` darker if it lands under 4.5:1 for body text — everything else in this
  palette already clears it comfortably.

## 2. Shared components (new or reworked)

- `Header.tsx` replacing `NavBar.tsx`: thin top bar (business name left, "last
  played" right, per the decision above) + wordmark row ("TIME MACHINE" / "FOR YOUR
  BUSINESS", centered uppercase nav: MY BUSINESS / WHAT-IFS / COMPARE / JOURNAL,
  brown pill CTA button right). Nav labels should probably drop the café-specific
  "MY CAFÉ" in favor of an industry-neutral "MY BUSINESS" (or keep it dynamic per
  selected business's industry — decide when the industries task defines the data
  model).
- `SectionHeading.tsx`: centered title + small inline-SVG coffee-bean icon (or a
  more industry-neutral icon set, see open questions) + one-line subtitle, reused on
  every page.
- `lib/formatChance.ts` (new, tested): `"77 of 100"` / `"Never"` phrasing for
  probabilities, replacing raw `%` in the results table and scenario cards.
  `riskAlert.ts` itself stays untouched — the ≥10% red alert keeps its existing
  wording.
- `lib/monthLabel.ts` (new, tested): a purely *display* mapping from the stored
  integer `start_month` (1, 2, 3…) to a month name cycling Jan–Dec with a "(Year 2)"
  suffix past 12 — the underlying integer sent to the API is unchanged.
- `lib/estimateMonthlyRevenue.ts` (new, tested): a simple non-engine arithmetic
  estimate (`(customers × visits_per_regular + walk_ins) × avg_ticket`) purely for
  the live "rough estimate: about ¥51,350 in sales a month" hint on the setup
  wizard — clearly labelled as a rough estimate, never touches `btm_engine` or the
  simulate endpoint.
- Chart colors/legend: update `SCENARIO_COLORS` to baseline `#8A7565` **dashed**,
  plus `#A0522D` / `#5E7A4E` / `#C99A3E`. `MetricChart` gets a dashed stroke for
  index 0 and a custom legend that appends each scenario's month-24 (or last-month)
  value.

## 3. Page redesigns

- **Compare**: hero band ("Four Possible Futures", pill-style horizon toggle
  instead of a `<select>`, "PLAY AGAIN" = the existing run button restyled/
  relabeled); scenario cards (photo top by decision type, serif name, big median
  profit, "Better than doing nothing in 77 of 100 futures", "SEE WHY" pill that
  scrolls/highlights that scenario's row in the table below — no new data fetch);
  big profit chart + 3 smaller charts instead of a uniform 2×2 grid; an alt-band
  "What This Means" section with plain sentences built only from fields the summary
  already has; results table restyled with the new probability phrasing.
- **What-ifs** (scenario builder): script-font line, big centered scenario-name
  input, a **disabled** "Describe it in your own words — coming soon" box (inert,
  hints at the future AI layer); the type `<select>` becomes 6 icon tiles (simple
  inline SVGs, no emoji); the decision form becomes an inline sentence ("Change
  prices by `[10]` % starting in `[March]`") using the month-label mapping; a
  right-hand "The recipe" sidebar listing each decision as a checklist step, save
  disabled until every step is checked (locked-in decision above), versions/
  "Duplicate as new version" moved there too.
- **My business** (setup wizard): centered "Tell us about your {industry}" (business
  name/industry-driven heading, per the locked-in decision above), numbered 3-step
  progress bar, one card with fields laid out in 3 columns per step, live "rough
  estimate" revenue hint under step 1. Note: the industries task is expected to
  change this wizard's fields/copy directly — coordinate so this restyling doesn't
  get built against fields that are about to change shape.

## 4. Photos

Per-industry photo sets (café / restaurant / bakery), each covering the six
decision types (price, hiring, marketing, hours, menu, investment) so a scenario
card's photo matches both the business's industry and the decision type — exact
count depends on how many industries ship and whether some photos can be shared
across industries (e.g. a generic "till/receipt" shot for "price" might work for
all three). Two of the photos per industry double as the Compare/Setup hero
banners with a light overlay for text contrast. Source from Unsplash/Pexels (both
free-to-use, no attribution legally required, but credit anyway), resize/compress
to under 200KB each, and write `frontend/public/images/CREDITS.md` with source URL,
photographer and license for each image.

## 5. Accessibility

Real `<button>`/`<label>` elements throughout (tiles and pill toggles are buttons,
not styled `<div>`s), verified 4.5:1 contrast, risk/status info always carries text
alongside color, no emoji anywhere (inline SVGs only).

## 6. Verification

`npm test` (existing suite + new tests for the formatting helpers) and
`npm run build`, then commit and push — no servers left running.

## Open questions for the industries task

Resolve these once the industries task defines the data model, before resuming
this redesign:

- Where does "industry" live? A new `industry` field on `Business`/`BaselineIn`, a
  free-text field, or an enum (café/restaurant/bakery)? This determines how
  `SectionHeading`/`Header` pick the right heading text and photo set.
  hardcoded phrases.
- Do the six decision types (price, hiring, marketing, hours, menu, investment)
  stay identical across industries, or does the setup wizard's field set
  (customers, seats, cogs_ratio, etc.) change per industry? If fields change, the
  3-column "My business" card layout and the live revenue-estimate formula both
  need to be industry-aware, not just re-themed.
- Confirm the nav label: "MY BUSINESS" (industry-neutral) vs. something dynamic per
  selected business.
- Confirm whether the coffee-bean `SectionHeading` icon should become a
  per-industry icon (bean / fork-plate / rolling-pin) or stay one neutral icon
  across all industries.
