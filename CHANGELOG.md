# What's new

What changed in Business Time Machine, newest first. Dates are from the Git history (`git log`). The engine, backend and
frontend test counts at the end of each step are in `CLAUDE.md` and the README.

## Clearer navigation for business owners (2026-10-26)

- Rename the existing main navigation to Overview, Try an idea and Track results while preserving every route. Keep detailed setup and specialist pages in Advanced, with saved-work, assumptions and PDF shortcuts.
- Add short page introductions, one prominent next action and context-preserving links to saved plans and comparisons. Keep essential figures and the journal form first; disclose optional charts and explanations. Make the tour opt-in.
- Keep keyboard focus and scrolling with page introductions, preserve assumptions deep links, and support Escape in Advanced. Document future Tools placement without adding an empty Tools entry or calculators.
- Validation: 853 frontend tests across 61 files, production build, lint and whitespace checks. Existing lint/bundle warnings remain. Backend, engine, saved records and PDF print styling are unchanged.

## Beginner-friendly result explanations (2026-10-26)

- Add a shared four-part explanation to sketches, timelines, comparisons, saved runs and the printable report, with optional numbers and assumptions details. Preserve the purple design and the designed PDF export from the preceding branch.
- Freeze original action inputs, date labels, currency and the existing engine’s central profit breakdown with new results. Keep Monte Carlo comparisons separate from central-run causes and state when evidence is missing or disagrees. Existing runs are not reconstructed from mutable scenarios.
- Hide explanations during updates, mismatched selections or failed calculations. Guard late history/comparison responses and business changes. Remove unsupported generic “low risk” price advice.
- Validation: 835 frontend tests across 60 files; 682 backend tests passed and one expected skip; 356 engine tests passed; build/lint complete with existing warnings. Desktop and 390px mobile views reviewed. Final PDF rendering remains unverified because GObject/Pango is unavailable on this machine.

## A designed PDF export from Share (2026-10-26)

- Replace monochrome print styling with purple summary cards, comparison highlights, coloured SVG charts and separate overview, charts and assumptions sections. Values come from the selected saved run and business currency; loss and unchanged outcomes are labelled honestly.
- Retain all uncertainty notes, sample labels, original metrics and print privacy wording. Keep tables, cards and figures legible on A4, with natural overflow for longer content. Explain the browser settings for removing its date/URL headers.
- Delay printing while the selected scenario loads and omit stale comparisons. No simulation, backend or financial model changes.
- Validation: frontend report tests cover positive, negative and zero profit differences; full frontend tests, TypeScript/build and lint. Three-page fixture visually rendered through WeasyPrint; Chromium print-dialog verification remains pending because the browser download is unavailable.

## A clearer first experiment for beginners (2026-10-25)

- Replace the green-heavy brand treatment with violet, coral and warm white, using the existing shared tokens so charts and controls remain consistent.
- Lead with “Big idea? Try it first.”, a short everyday description, and a gently animated café illustration. Remove the long feature/photo sections, team quote, repeated guide link and duplicate header link. The business switcher remains available when a business is open; saved businesses remain reachable on the start screen.
- In the demo, show a concrete order-price example, money left after bills and the possible downside immediately. Reveal bank figures and uncertainty through “What else could happen?”. Use everyday labels on Today, Share and Try. Keep engine calculations and confirmation rules unchanged.
- Validation: 788 frontend tests across 56 files, accessibility/contrast checks and production build; existing warnings remain. Animation respects reduced-motion settings.

## Brand palette and clock mark (2026-10-25)

- Retain Business Time Machine, with the descriptor “Explore tomorrow’s business decisions.” in the wordmark and page description.
- Use a deeper forest green, neutral cream, quieter sage and muted amber. Primary landing/dashboard actions are green; amber remains for selected controls, saved-plan actions and caution. Remove the orange button glow.
- Replace the generic clock and default Vite favicon with a matching clock whose hands branch into a forward direction. The mark stays decorative beside the accessible brand link.
- Palette, chart and contrast checks are updated to the new tokens; all readability assertions remain in place.

## Interactive landing demo and visual refinement (2026-10-24)

- The hero now uses a shorter headline, a neutral surface and an opt-in sample café price slider. It creates a sample only when Run this example is clicked; all displayed financial figures come from the existing preview-change endpoint through useSketch.
- Loading, stale results, retry, the sample's currency and a full-simulator handoff are covered. The earlier direct sample entry and figures-first Today dashboard remain.
- Validation: 787 frontend tests in 56 files pass, including accessibility checks, engine-response display and slider updates. Production build and lint complete with existing bundle-size and unchanged-file lint warnings. Backend and engine are unchanged.

## Faster first sample and clearer dashboard (2026-10-24)

- The hero names the food businesses the simulator serves, offers setup with your own numbers and a one-click sample café, and replaces the fixed money example with a decision-flow preview containing no financial results.
- Today shows key financial figures before the coach, with an explicit Key figures heading and a prominent Explore a change action. Secondary cards use lighter borders and less decoration.
- Sample failures appear beside the hero action and support retry. Existing sample actions, onboarding, startup guide and confirmation rules are retained.
- Validation: 783 frontend tests in 55 files, production build and lint pass. Lint reports warnings in unchanged files. Engine and backend were not changed or re-tested.

## Combine the website improvements (26 Oct 2026)

- Combine the prepared updates from PRs #6, #10, #12, #13 and #14 on one review branch, preserving their history and reconciling documentation.
- Explain simulated outcomes consistently across the demo, results and printable summary; keep marketing-response limitations visible.
- Label previous slider results and require a successful matching calculation before saving or continuing.
- Save unfinished setup in the current browser tab, with Continue setup / Start over; recalculate the summary before confirmation and clear the draft only after successful creation or explicit reset.
- Offer Prices, Staffing, Opening days and Marketing through Explore; keep the direct price slider and existing confirmation process.
- Run Project checks on pull requests, master updates and manual dispatch with separate engine/backend/frontend jobs, pinned actions and no API keys or real business database.
- Reconcile the documentation and test counts. Add a cross-feature Explore → price → failed update → recovery → timeline regression check. Final local validation passed 813 frontend tests, 356 engine tests and 678 backend tests (one expected skip), plus build, lint and actionlint. Browser and printed-layout verification remain pending.

## Pictures labelled and credited (Oct 2026)

- The four start-page pictures are now labelled as AI-generated illustrations (ChatGPT, October 2026): a new `frontend/public/images/redesign/CREDITS.md`, alt text that starts "Illustration of ...", and one line in the start-page footer. The café, restaurant and bakery photos are still credited to their Pexels photographers. README has an "Images" section. Docs and text only.

## Start page: no "Continue" bar (Oct 2026)

- The "<name> is open. Continue with <name>" bar above the hero is gone. With a business open, the top bar of the start page shows a "Today" link next to "How it works" and "What you get"; the business switcher is unchanged. With no business open the page looks as before.

## Bug-fix pass: practice businesses and the coach (Oct 2026)

- **Coach used the wrong currency.** A café in yuan read "$168,000" in the coach's words. The prompt was stripping the currency symbol; it now keeps it, and a new check rejects any AI text with another currency's symbol or code (the rule-based text then stays).
- **Practice businesses.** The Today coach says plainly that it is a practice business built from a rough plan, with no praise and nothing about regulars. The practice business now starts at the plan's own break-even customers when you hoped for more (a China café went from a 49% profit margin to about 9%).
- **Layout.** "You haven't tried a change yet" is full width like the other cards; the chart's CN¥0 label no longer touches the first month; the "US dollars" notice is not shown for practice businesses.
- **A real race fixed.** A poll could overwrite a finished AI answer with "failed" (the cause of a flaky test); it now re-reads the row first. Test added without threads or sleeps.

## "I don't have a business yet" start-up guide (Oct 2026)

- **New.** Nine questions and a rough, sourced start-up plan: cost lines with sources and a wide total, running costs, break-even, a starting budget with named assumptions, a first-year checklist with official pointers, and what you will probably struggle with. The United States has the full plan, the United Kingdom and China bring your own numbers, other countries get the checklist only. A button makes a practice business to try in the simulator. Saved on your computer only; edit and delete with Undo; prints black on white.
- **Behind it.** One sourced data file with a test that refuses any number without a source, link and date; a hand-run link checker; a `startup_plans` table (migration not yet run on the real database).

## Start page polish (Oct 2026)

- **Quote card.** New wording from the team ("We can't promise the future. We can help you see what might happen before you decide."), a round sage badge with a coffee cup on the left, the words on the right, a short amber bar above the attribution, and a stacked layout on a phone.
- **Start page polish.** A two-line headline that fits, a centred hero with a capped photo and an example card fully inside it, three equal photo cards, a slim centred "Continue with ..." pill, an evenly spaced top bar with a clear hover state, and one spacing scale.

## The new look, on every page (Oct 2026)

- **Step 2: all pages.** Today, the 12-month view (now with an amber "Save as a plan" button), My journal (a small confetti after saving a month), How we worked it out, Share, run history, Compare, Advanced, the scenario builder, empty and error states, dialogs and the undo bar. One colour system for every chart, no red anywhere, round markers in the journal bars, and a Share page that prints as plain black on white.
- **Step 1: look, start page, Try a change.** A single place for the design (`frontend/src/theme.css`), self-hosted fonts (Nunito, Inter, Patrick Hand), a welcome start page with photos, the Try a change page with three result tiles, and a small confetti after saving a plan. Photos are converted to small WebP files.

## Planning the user study (Oct 2026)

- **Study mode plan** (`docs/study-mode-plan.md`): how a coach / no-coach study could run, what would be stored (and what not), how decision quality would be scored from the engine, and the questions that need answers first. **Nothing is built yet and no study data has been collected.**

## My journal (Oct 2026)

- Write down what really happened each month (what you kept, money in the bank, customer visits) and see it next to what the forecast said, in plain words and a small chart. A pilot feature, with no AI. Edit, delete with undo, and download as a spreadsheet file.

## How we worked it out, Share, friendly empty states (Oct 2026)

- A plain page that separates what you told us from what we assumed, with a "Change this" link for each guess.
- A one-page summary you can print or save as a PDF from your browser. Nothing is sent anywhere.
- Every empty place and every failed load now says what is happening and offers one clear next step.

## Try a change and the 12-month view (Oct 2026)

- A price slider that answers as you drag ("just a sketch", nothing saved): what you keep each month, the catch (fewer visits), and ten dots for "ahead in N of 10 futures".
- A month-by-month view of the next 12 months. "Save as a plan" asks you to confirm a plain sentence, then runs the full simulation with the coach.

## A "← Back" button on every page (Oct 2026)

- Every page except the start page returns to the page you were on, or one level up if you opened a link directly. The browser's own Back button keeps working.

## Start page always reachable, business switcher and delete (Oct 2026)

- The title in the top bar always opens the start page. A business menu lets you switch, start a new business or try a sample.
- Delete is reversible (an Undo message for 8 seconds); nothing is erased unless you run the purge script on purpose.

## Simple start and the Today page (Oct 2026)

- Pick a business type, answer four questions, and land on Today where the coach speaks first. One-click sample businesses. A short first-time tour.

## Earlier work (Sep to Oct 2026)

- A coach that never makes you wait, with grounding and claim checks; "Ask the coach"; "Confirm all"; a simpler scenario picker.
- Plain-language decision input ("describe it in your own words").
- Café, restaurant and bakery in one engine; per-business currency; plain wording with "?" tips.
- The first FastAPI backend, React frontend and simulation engine.

