# What's new

What changed in Business Time Machine, newest first. Dates are from the Git history (`git log`). The engine, backend and
frontend test counts at the end of each step are in `CLAUDE.md` and the README.

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
