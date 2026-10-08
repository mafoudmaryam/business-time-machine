# Study mode: plan (awaiting approval)

Status: **plan only, nothing built.** Written 2026-10-08 after reading `CLAUDE.md`, `docs/beginner-journey-plan.md`
and the code study mode will touch (`settings.py`, `coach/service.py`, `coach/today.py`, `models.py`, `routers/beginner.py`,
`ConfigProvider`/`config.ts`, `start.ps1`, `.gitignore`). Ethics approval is **not yet confirmed**, so the rule for the whole
plan is: *collect the least personal data that still answers the research question.*

Research question: do an AI-assisted simulation, and an AI coach explaining it, help non-expert small-business
owners make **better** and **more confident** decisions? Design: between-subjects, **coach on** vs **coach off**.

What differs between the groups is *only* the coach. The scripted business, the numbers, the charts, the seed and
the options are identical.

## 0. What already exists (and what that saves)

| Already built | Use in study mode |
|---|---|
| `businesses.participant_code`, `businesses.study_condition` (Phase 1) | Set on the scripted business of each participant |
| `settings.coach_enabled_for(business)`, called by every coach / ask / today path | The **one** place the condition switches the coach off |
| `GET /config` with `study_mode: false` and `ConfigProvider` / `useConfig` | The switch the frontend reads |
| `ui_events` (session, business, participant_code, screen, name, small payload, no free text) | Behaviour log |
| `ai_interactions`, `coach_results.ai_status`, `coach_answers`, `decisions.confirmed_via`, `simulation_runs` (seed, iterations, engine_version) | Coach/AI log and reproducibility |
| `lookup.py` (every owner-facing lookup goes through it) | The one choke point for "a participant can only see their own business" |
| Soft delete and `purge_deleted.py` | Withdrawal and cleaning test data |
| `start.ps1 -TempDb` | Pattern for a separate study database |

Two **leaks found in the current code** that must be fixed, because they would show the coach to the "off" group:

1. `coach/service.py:213` `status()` uses the global `settings.coach_enabled()`, not `coach_enabled_for(business)`. `GET /coach/status` would say "enabled".
2. `GET /config` returns one global `coach_enabled`. In study mode the answer has to depend on the participant.

(The interpret router, "describe it in your own words", does not use `coach_enabled_for`; see section 3.)

## 1. Participant flow

Everything the participant answers is saved to the server **as they go**, so a refresh or a lost connection resumes at the
same step (section 7). The participant is never shown the words "condition", "group" or "control".

| # | Step | What the person sees | What is saved |
|---|---|---|---|
| 0 | **Welcome** | One screen: what the study is (in plain words), about 20 minutes, no names or emails collected, you can stop any time. Button "Continue". | nothing |
| 1 | **Consent** | The consent text (wording from the ethics application, versioned: `consent_version`). Two tick boxes: "I have read this" and "I agree to take part". "I do not agree" ends the session politely. States what is stored (section 2), that AI text comes from an AI provider, that they should **not type personal information**, and how to withdraw. | consent version + time (only after both boxes are ticked) |
| 2 | **Participant code** | "Enter the code you were given" (e.g. `K7M4-9QXT`). A researcher-issued code, not chosen by the participant. | code marked used |
| 3 | **Assignment** (no screen) | Instant and silent. Next unclaimed slot of a **pre-generated balanced list** (section 2.4) decides coach on / off. The scripted business is created for this participant. | condition, business |
| 4 | **Background questionnaire** | 5 coarse questions, about 1 minute (list in section 2.2). No age, gender, country, name. | answers |
| 5 | **Task brief + confidence before** | One page about the scripted business and the question ("Which of these options would you choose to improve the profit over the next two years?"). Then: "How confident are you that you could make a good choice for this business?" 1 (not at all) to 7 (completely). Locked once saved. | answer + time |
| 6 | **The task** | The business's **Today** page, then the options page: 5 or 6 preset options (section 4.2) and "if you change nothing". The person may simulate any option, compare up to 3 at a time on the normal Compare page, and open results as often as they like. The coach-on group also sees the coach; the coach-off group does not. | behaviour events, runs, scenarios |
| 7 | **The decision** | "Which option would you choose?" One option, then a second question: "How confident are you in this choice?" 1 to 7. They may change their pick until they press "This is my final answer". | every pick (with time), final pick, confidence after |
| 8 | **SUS** | The 10 standard System Usability Scale statements, 1 (strongly disagree) to 5 (strongly agree) (section 2.2). | 10 answers |
| 9 | **Thank-you and debrief** | Thanks; one paragraph saying that there were two versions of the app and why; asks them not to discuss it with other participants for now; shows the **code** (for withdrawal requests) and the researcher's contact. Button "Start next participant" (clears the browser tab's state). | completed time |

Order notes:
- Step 3 (assignment) comes before step 4 as you asked. Alternative in Q8: put the questionnaire first so the assignment can balance on experience.
- Confidence *before* is asked **before** the participant sees any result, so it cannot be influenced by the tool.
- The study uses its own shell (`/study/...`): no business switcher, no "Advanced", no sample businesses, no journal, no tour. The pages the task needs (Today, Compare, run results) are re-used unchanged inside it.

## 2. What is stored, and what is not

### 2.1 Never stored
Names, emails, phone numbers, IP addresses, user-agent strings, device ids, cookies for tracking, location, age, gender,
screen recordings, free text typed into the app (except the optional ones in Q6 / Q7, which are off by default).

How "no IP" is actually enforced (the app itself never records one, but the web server does by default):
- uvicorn writes the client IP in its **access log**. Study mode starts the backend with `--no-access-log` (done by `start.ps1 -Study`), and the plan forbids request-body logging.
- If the study is ever hosted (not on your laptop), the host's proxy logs IPs too. That is why Q1 (where sessions run) matters for the ethics form.
- `ui_events` has no IP column and `/events` ignores the request address; a test asserts that nothing request-derived but the participant's own session id is stored.

Data is **pseudonymous**, not anonymous, if you keep a list that links codes to people (for example "code K7M4 = the café owner I met on Tuesday"). Keep that list outside this project, off the computer the data lives on, and decide in the ethics form whether a list exists at all. If participants are given codes by lot (a slip of paper from a bag) and you never record who got which, the data is effectively anonymous but withdrawal after the session becomes impossible; that is the ethics trade-off in Q3.

### 2.2 Stored (all keyed by the participant code only)

**Background questionnaire** (coarse choices, no free text):
1. `bg_role`: I own or run a food business / I have worked in one / I have never worked in one.
2. `bg_experience_years`: none / under 2 / 2 to 5 / over 5 (running or working in a food business).
3. `bg_numbers_comfort`: "How comfortable are you with reading business numbers (profit, cash)?" 1 to 7.
4. `bg_ai_use`: "How often do you use AI chat tools?" never / a few times / monthly / weekly / daily.
5. `bg_prior_simulation`: "Have you used a tool that predicts business results before?" yes / no.

**Confidence:** `conf_before` (1 to 7), `conf_after` (1 to 7, about the chosen option).

**SUS** (Brooke, 1996; the original ten statements, with "system" replaced by "app", which is common practice):
1 I think that I would like to use this app frequently. 2 I found the app unnecessarily complex. 3 I thought the app was easy to use.
4 I think that I would need the support of a technical person to be able to use this app. 5 I found the various functions in this app were well integrated.
6 I thought there was too much inconsistency in this app. 7 I would imagine that most people would learn to use this app very quickly.
8 I found the app very cumbersome to use. 9 I felt very confident using the app. 10 I needed to learn a lot of things before I could get going with this app.
Score (computed at export, never trusted from the browser): odd items contribute `(x - 1)`, even items contribute `(5 - x)`; sum all ten; multiply by 2.5 (0 to 100).

**Decision:** every pick (`option_id`, time, whether final), plus the scenario and run it relates to.
**Behaviour:** `ui_events` as today, plus the events listed in section 6.
**Coach/AI:** `ai_interactions`, `coach_results`, `coach_answers`, which provider and model were used (copied onto the participant row).
**Timing:** started, step times, completed, last seen.

### 2.3 New tables (one migration, tested up, down and up again on a copy, like the journal migration)

| Table | Columns | Purpose |
|---|---|---|
| `app_meta` | `key` PK, `value` | holds `db_kind = 'study'` or `'dev'` (section 7.1) |
| `study_allocation` | `position` PK, `block`, `condition` (`coach`/`no_coach`), `claimed_by` (nullable, unique) | the pre-generated balanced list |
| `study_codes` | `code` PK, `is_test`, `participant_id` (nullable, unique) | the codes you hand out |
| `study_participants` | `id`, `code` unique, `condition`, `allocation_position`, `status` (`in_progress`/`completed`/`withdrawn`), `step`, `token_hash`, `consent_version`, `consent_at`, `business_id`, `task_version`, `engine_version`, `coach_provider`, `coach_model`, `started_at`, `completed_at`, `last_seen_at`, `withdrawn_at`, `is_test` | one row per person |
| `study_responses` | `id`, `participant_id`, `instrument` (`background`/`conf_before`/`conf_after`/`sus`/...), `item`, `value_int`, `value_text` (null unless Q6), `client_key`, `answered_at`; **unique** `(participant_id, instrument, item)` | all answers, long format |
| `study_choices` | `id`, `participant_id`, `option_id`, `is_final`, `chosen_at`, `scenario_id`, `run_id` | every pick, in order |

`businesses.participant_code` and `businesses.study_condition` (already there) are filled when the scripted business is created, so the existing `coach_enabled_for(business)` works without a new lookup. The participant row is the source of truth; the business copy is for the existing code paths.

### 2.4 Balanced assignment (not pure chance)
- A researcher script, `backend/scripts/study_generate_allocation.py --n 60 --block 4 --seed S`, makes a **permuted-block list**: in each block of 4 there are exactly 2 "coach" and 2 "no_coach", in random order. The seed `S` goes in your notes (reproducible, auditable).
- When a participant enters a valid code, the server takes the **next unclaimed position** inside one database transaction (unique constraint on `claimed_by`), so two participants starting at the same moment can never take the same slot. The condition is therefore decided by the list, not by the participant, the code or the clock.
- Result: after every 4 people the groups differ by 0; at any moment by at most 2.
- Option (Q8): ask the background questionnaire first and use **stratified** blocks (experienced / not experienced) so the groups are balanced on experience as well. Recommended if the sample is under about 40 per group.
- Codes are random and **do not encode the condition**. `backend/scripts/study_generate_codes.py --n 80 --test 5` writes them to `study_codes.txt` in the repo root (git-ignored) for you to print; codes starting `T` are test codes (section 7).

## 3. Switching the coach off for one group

Rule: **the server decides, the browser only follows.** A participant who edits the page, calls the API by hand or opens another URL still cannot get coach text in the "off" condition.

**Server (authoritative)**
- `settings.coach_enabled_for(business)` becomes: global switch off -> False; else if `STUDY_MODE` is on and the business has a `study_condition` -> `condition == 'coach'`; else True. This is the one function every coach path already calls (coach card, ask, today note, `ask` poll).
- Fix the two leaks from section 0 (`status()`, `/config`). In study mode the browser asks `GET /study/me` (with its token) and receives **only** `{coach_enabled, step}`, never the condition's name.
- Coach endpoints for an "off" participant return the **same shape the app already returns when `COACH_ENABLED=false`** (a plain "coach is off" answer, no text), start **no background job**, and write **no `ai_interactions` row**. Tests prove each of these, so the "off" group also costs no AI money and leaves no AI trace.
- The AI "Today note" is part of the coach (same flag), so it is hidden and never generated for the "off" group.

**What counts as "the coach"** (needs your agreement, Q6): everything inside `CoachCard` (verdict badge, "now -> later" tiles, "Why?" bars, "Watch out" line, idea cards, full story, "Ask the coach"), the Today coach note, and the "Ask a question" link. The "off" group still has the Compare dashboard's own numbers, the bad / most-likely / good chart bands, the "in N of 10 futures" cash-risk alert and the Today tiles and chart. So *the numbers and charts are identical*; the coach adds interpretation.

**Frontend**
- Every coach element is already behind `useConfig().coachEnabled` for Today; `CoachCard` and the ask link on Compare / run results get the same guard. The off state renders **nothing and reserves no space** (no empty box, no "coach is off" message that would tell the participant what they are missing).
- A snapshot test per page and per condition: with the coach off, the page contains no coach text and no placeholder.
- **Identical-numbers guarantee:** the scripted task uses a fixed seed and iteration count taken from the task file (not `1000 + business id`, which differs per business), so every participant sees the same numbers. A backend test requests Today and Compare for a coach participant and a no-coach participant and asserts the payloads are **equal once the coach fields are removed**.
- The "describe it in your own words" box (AI interpretation) is **not part of the study task** (the task is a closed set of preset options so that the decision can be scored). It is hidden for both groups, which keeps the groups equal and sends no participant free text to the AI provider. This narrows the thesis claim to "the coach", and the thesis must say so (Q7).

**One free-text exception:** the coach group's "Ask the coach" box lets people type a question. That question is stored (`coach_answers`) and sent to the AI provider. Options (Q6): keep it with a one-line warning ("Please don't write names or personal details") and a 200-character limit, or allow only the three chip questions in the study. Recommended: keep it with the warning, and exclude the text from the default CSV export.

## 4. Decision quality, scored objectively from the engine

### 4.1 The idea
Participants choose among a **fixed, known set of options** for a **scripted business**. Before the study, the engine evaluates every option at high quality (10,000 futures). The score says how close the participant's choice is to the best option **according to the model**. The LLM computes nothing.

### 4.2 The scripted task (`task_v1`)
A file in git, `backend/app/study/task_v1.json`, no personal data in it:
- A fictional business ("Maple Street Café": customers a day, average spend, rent, staff, currency) built with `quick_baseline`, plus a short story and the question.
- 5 or 6 options, each one or two engine `Decision`s validated against `DECISIONS_JSON_SCHEMA`: for example a price rise, a part-time baker, a promotion, shorter hours, a new menu item, and one **tempting but risky** option (looks best on average profit, but runs out of cash in several futures), plus "change nothing".
- Task parameters: horizon 24 months, seed `T`, display iterations 1,000 (what the participant sees), scoring iterations 10,000.
- Tuned with the engine so that the best option is clearly separated from the second best (gap at least 2 standard errors of the 10,000-run mean) and so that the ordering a participant sees at 1,000 futures is the same as at 10,000. A test enforces both.

### 4.3 The formula
Let `H = 24` months. For option `o` and future `k` (of `N = 10,000`), let `P(o,k)` be the **cumulative profit over H months**. Let `b` be "change nothing".

```
V(o)     = (1/N) * sum_k P(o,k)              expected 24-month profit of option o
G(o)     = V(o) - V(b)                       expected gain over doing nothing
G*       = max over options of G(o)          the best option's gain
G_min    = min over options of G(o)          the worst option's gain
Regret(o)= G* - G(o)                         money left on the table (in the business's currency)
Score(o) = (G(o) - G_min) / (G* - G_min)     0 = worst option, 1 = best option
```

Primary outcome: **`Score` of the final choice** (0 to 1). Secondary outcomes, all computed at export from the stored choice:
- `chose_best` = 1 if the final choice is the option with the highest `G`.
- `chose_better_than_nothing` = 1 if `G(o) > 0`.
- `chose_safe` = 1 if the share of futures where cash drops below 0 at any month is at most 10% (the app's existing "N of 10 futures" idea, here 1 of 10).
- `chose_trap` = 1 if the final choice is the tempting-but-risky option.
- `changes_of_mind` = number of picks before the final one.

The thresholds and the definition of "best" are **written down before the pilot data are seen** (suggested: pre-register the plan in a dated note or the thesis appendix).

The values `V(o)`, `G(o)`, cash-out share, plus `engine_version`, seed and iterations are produced by `backend/scripts/study_score_options.py` (goes through `engine_bridge`, so the engine stays standalone) and **committed as `task_v1.scores.json`**. A test recomputes them and fails if the engine changes the numbers, which forces a re-score and a `task_version` bump (golden rule 4: reproducibility). `study_participants` stores `task_version` and `engine_version`.

### 4.4 Honest limits (they belong in the thesis)
- "Best" means best **inside the model**. The coach explains that same model, so a higher score shows the participant understood and used the model's output better, not that the choice is better in the real world. Secondary measures (confidence, SUS, and the optional comprehension questions in Q10) help separate understanding from agreement.
- A small, closed option set cannot test whether the coach's *new ideas* help; it tests whether the coach helps people read results and pick well.
- Confidence is not accuracy. Report both, and the **gap** between them (a confident wrong choice is a finding).

## 5. Admin side

**Switch and key.** Admin routes exist only when `STUDY_MODE=true` **and** `STUDY_ADMIN_KEY` is set to a value of at least 24 characters; otherwise they return 404. The key lives in `backend/.env` (already git-ignored) and is never in the repo, never in a URL, never in `localStorage`. The browser sends it in the header `X-Study-Admin-Key`; the server compares with `hmac.compare_digest`; after 5 wrong tries in a minute it answers 429 for a minute. Note: `backend/.env.example` is currently *also* git-ignored (see `.gitignore`), so the documented variables must go in the README/this plan, or the ignore rule must be narrowed; to be decided at build time.

**Progress page** (`/study/admin`, key typed into a field, held only in memory):
- Counts: codes issued / started / completed / withdrawn, by condition (so balance is visible), and a funnel by step (how many are at consent, background, task, decision, SUS).
- Median time per step and in total; number of test participants (shown separately).
- A table of **code + step + last seen to the minute**, nothing else, so you can help someone who is stuck. No answers, no free text, no business details.
- Refreshes itself every 30 seconds. Nothing on it can identify a person.

**CSV exports** (`GET /study/admin/export/<name>.csv`, UTF-8 with BOM, notes starting with `=`, `+`, `-`, `@` made harmless like the journal export). Test participants excluded unless `?include_test=true`. Withdrawn participants excluded always.

`participants.csv` (one row per participant, ready for analysis):
`participant_code, condition, allocation_position, block, task_version, engine_version, coach_provider, coach_model, consent_version, consent_at, started_at, completed_at, duration_s, status, bg_role, bg_experience_years, bg_numbers_comfort, bg_ai_use, bg_prior_simulation, conf_before, conf_after, conf_change, final_option, final_chosen_at, changes_of_mind, expected_gain, regret, score, chose_best, chose_better_than_nothing, chose_safe, chose_trap, sus_01 ... sus_10, sus_score, options_simulated, compare_opens, coach_card_seen, coach_story_opened, ideas_clicked, ask_count, time_on_task_s, refresh_count, error_count`

`choices.csv`: `participant_code, order, option_id, is_final, chosen_at`.
`events.csv`: `participant_code, condition, session_id, created_at, screen, name, payload_json`.
`ai.csv` (coach group only; metadata, not full prompts by default): `participant_code, kind, provider, model, attempt, duration_ms, prompt_tokens, completion_tokens, grounding_passed, claims_reason, fell_back, error, created_at`. `?full=true` adds `prompt` and `response`. Ask-question text is a separate `?include_text=true`.
`responses.csv`: the long-format answers as stored (`participant_code, instrument, item, value_int, answered_at`).
`task.csv`: the option scores for the task version used (`option_id, label, expected_gain, cashout_share, score, is_best, is_trap, engine_version, seed, iterations`).

Researcher scripts (not web): `study_generate_codes.py`, `study_generate_allocation.py`, `study_score_options.py`, `study_withdraw.py --code X` (hard-deletes everything for a code, including `ai_interactions` rows and logs, and prints what it removed; dry run by default like `purge_deleted.py`), `study_backup.ps1` (timestamped copy of `study.db` to a folder you choose).

## 6. What the existing logs already give us, and what is missing

**Already there (usable now):**
- `ai_interactions`: every coach / ask / today call with prompt, response, tokens, duration, grounding result, retries, fallback, errors. Linked to run -> business -> participant.
- `coach_results.ai_status` (`pending`/`done`/`failed`): did the AI version arrive in time? Important for the coach group: a participant who decided before the AI text arrived effectively saw the rule-based coach. Must be reported per participant.
- `simulation_runs`: seed, iterations, engine_version, kind.
- `decisions.confirmed_via`; `ui_events` for Today, Try, Start, Journal, Tour, delete flows.

**Missing, to be built:**
1. Consent, background, confidence, SUS, choices, participants, allocation (the new tables).
2. **No events at all in `CoachCard`, `AskCoach`, the Compare page or the scenario picker.** Needed: `coach_card_shown`, `coach_ai_arrived` (with seconds since shown), `coach_story_opened`, `coach_idea_clicked`, `ask_sent` (length only, no text), `ask_chip_used`, `compare_opened`, `option_selected` / `option_deselected`, `run_started`, `run_result_viewed`, `chart_toggle`.
3. **Condition on every row, not only through joins.** Export joins `business -> participant`; if a row is orphaned the condition is lost. The `participant_code` column on `ui_events` is filled server-side from the token (the browser never sends it).
4. **Time on screen.** Today you can only subtract consecutive `screen_view` times. Add `tab_hidden` / `tab_visible` events (Page Visibility API, no content) so time away from the task is not counted as reading time.
5. Refresh and error counts: `page_loaded` (with a reload flag), `save_retry`, `error_shown`.
6. Step-transition events (`study_step_entered`, `study_step_completed`).
7. Provider and model for the whole study on the participant row (so a mid-study `.env` change is visible).
8. Which coach text the participant actually saw (rule-based or AI version) at the moment of the final pick: `coach_version_at_choice`.

Events keep the existing rule: **no free text, no numbers the person typed**, only small ids and counts.

## 7. Risks and how each is avoided

### 7.1 Test or study data ends up in the developer database (and the reverse)
- Study mode uses its **own database file** (`backend/study.db`; `*.db` is already git-ignored). `start.ps1 -Study` sets `DATABASE_URL`, `STUDY_MODE=true`, `--no-access-log`, and runs `alembic upgrade head` on it.
- `app_meta.db_kind` guards both directions: with `STUDY_MODE=true` the server **refuses to start** unless `db_kind = 'study'`, and with `STUDY_MODE` off it refuses to start on a database marked `'study'`. `btm.db` can therefore never receive a participant, and a study can never run on it by accident. A test covers both refusals.
- Your own dry runs use `T...` test codes (`is_test = 1`), excluded from exports by default and removable with one script. Automated tests keep using temp databases.
- Back up `study.db` before every session day (`study_backup.ps1`). `backend/btm.db.backup-before-journal` currently shows up as untracked in `git status` because `.gitignore` only covers `*.db.backup`; widen it to `*.db.backup*` so no real-data backup can be committed by accident. (Not changed in this commit.)

### 7.2 Participant refreshes, closes the tab or uses Back
- All progress is server-side: `study_participants.step` plus saved answers. On load the app calls `GET /study/state` and routes to the current step. Entering the same code again (new tab, another browser) resumes and issues a fresh token (the old one stops working).
- Answers are **upserts** keyed `(participant, instrument, item)`: sending the same answer twice does nothing wrong.
- Locked once saved: consent, background, `conf_before` (the participant must not revise it after seeing results). Allowed to change until "final answer": the option pick.
- Creating the scripted business and the option scenarios is idempotent (one business per participant; one scenario per option), so a refresh in the middle of "Simulate" does not create duplicates. Existing caching reuses runs.
- Back button: allowed to look at earlier pages, but earlier answers are shown read-only.

### 7.3 Bad connection
- Small writes (answers, picks, step changes) are **acknowledged writes** with up to 3 retries and growing delay, a visible "Saving... / Saved" indicator, and a calm banner "Connection lost, your answers are kept here and will be sent when it is back". Unsent answers wait in memory and `sessionStorage` (a convenience; the server stays the truth) and carry a client-made key so a retry never duplicates.
- Behaviour events stay fire-and-forget (a lost click event is acceptable; a lost answer is not).
- The coach never blocks the page (already true: instant rule-based version, AI polled every 3 s). The study adds one sentence to the researcher guide: if the AI version is slow, the participant is **not** told to wait.
- If sessions are in person on your laptop, none of this is usually triggered; if remote, run a 15-minute test on a throttled connection (Chrome devtools "Slow 3G") before the pilot.

### 7.4 A participant sees the other group's screen
Four ways it can happen, and the fix for each:
- **Shared computer, previous participant's state:** every study page checks the token; "Start next participant" clears `sessionStorage`; the researcher guide says to use a fresh private window per person. Nothing in `localStorage` is written in study mode.
- **Editing the URL or calling the API:** coach text is withheld by the server (section 3), and every study request carries a token that `lookup.py` ties to **that participant's own business only**; any other business, run or scenario id returns 404. This also keeps participants from seeing each other's runs.
- **Wording that reveals the condition:** no "coach is off" message, no empty reserved space, no condition in URLs, page titles, `/study/me` output, or console messages (a test greps the study API responses for the words `no_coach`, `condition`, `control`).
- **Side-by-side screens or talking afterwards:** the researcher guide asks for separate screens or sessions, and the debrief asks participants not to discuss it. Residual risk is recorded in the thesis limitations. The JavaScript bundle contains the coach components for both groups (a very technical participant could read the code); the server-side switch makes that harmless.

### 7.5 Other risks
- **AI provider differs between participants or changes mid-study:** one provider and model for the whole study, recorded on each participant row (Q2).
- **Slow local model makes the coach arrive after the decision:** logged (`coach_ai_arrived`, `coach_version_at_choice`), and reported as a limitation; prefer a faster provider for the study.
- **Coach text contradicts the facts:** the grounding and claim checks already protect this and fall back to the rule-based text; the study logs how often (fell-back rate per participant).
- **Study mode visible to normal users:** see section 8.
- **Pressure to add more measures:** each extra questionnaire lengthens the session and the data you must justify to ethics. Keep to the list above unless Q10 says otherwise.
- **Underpowered sample:** decide the target group size now (Q4); a small sample means reporting effect sizes and confidence intervals, not only p-values.

## 8. The study-mode switch (off by default)

- `STUDY_MODE=false` by default (same `_flag` helper in `settings.py`, read when asked for). With it off:
  - the study router is **not mounted** (`/study/*` returns 404), the study tables stay empty;
  - `GET /config` returns `study_mode: false`; the frontend registers no study routes and shows no link to them;
  - `coach_enabled_for` behaves exactly as today;
  - the existing tests (278 engine, 619 backend, 673 frontend) pass unchanged. A test asserts the study routes 404 and `coach_enabled_for` is unaffected when the switch is off.
- With it on: the frontend redirects **every** route that is not `/study/*` to `/study` (no Advanced, no switcher, no way out of the participant's task), and the backend requires the db guard of section 7.1.
- The switch is an environment variable, not something a user can toggle in the UI.

## 9. Effort estimate

Working days of focused building, in the style of the earlier phases (each ends with tests green and a pause for review). Calendar time is longer; recruitment and ethics are yours.

| Phase | Content | Estimate |
|---|---|---|
| **S0 Decisions** | Answer the questions below; fix consent wording with the ethics text; choose the task business and options | 1 day (yours + mine) |
| **S1 Foundation** | `STUDY_MODE` switch, db guard + `start.ps1 -Study`, migration + tables, codes/allocation scripts, participant/token API, `lookup.py` scoping, `coach_enabled_for` + the two leak fixes, no-IP logging, tests | 3 days |
| **S2 Participant flow** | `/study` shell and redirects, consent, code, background, brief, confidence, decision, SUS, thank-you, resume, acknowledged-write queue, per-condition frontend guards on every coach element, accessibility checks | 4 days |
| **S3 Task and scoring** | `task_v1.json`, tuning with the engine, scoring script + committed scores + tests, options page, fixed-seed override, "numbers identical" test | 3 days |
| **S4 Admin** | admin key, progress page, CSV exports, withdraw / backup scripts, tests | 2 days |
| **S5 Logging gaps** | Events from section 6 (coach card, ask, compare, visibility, refresh), condition on rows, tests | 1.5 days |
| **S6 Pilot** | 3 to 5 pilot runs (test codes then real strangers), fix timing, wording, bugs; freeze `task_version` and the code | 2 days + calendar |
| **Total** | | about **16 to 17 working days** build, plus pilot calendar time |

Cut list if time is short: drop the admin progress page (keep CSV), drop `ai.csv?full`, reduce events to the minimum in 6.2 and 6.5. Do not cut the db guard, the server-side coach switch or the balanced assignment.

## 10. Questions to answer before building

1. **Where do sessions run?** In person on your laptop (simplest, no IP problem, no connection problem), or online with a link (needs hosting, HTTPS, host logs without IPs, bad-connection handling, a different CORS setup)?
2. **Which AI for the study?** One provider for everyone: Anthropic API (fast, sends only the fictional business's facts), local Ollama (free, but 50 to 80 seconds a call here), or the rule-based coach only (not "AI"). It must not change mid-study.
3. **Ethics: what is allowed?** Do you give codes by hand and keep a list linking codes to people (pseudonymous, withdrawal possible) or hand them out by lot (effectively anonymous, withdrawal impossible)? Which consent text, contact email on the thank-you page, how long is the data kept, and where?
4. **Sample:** how many people per group, and who are they (real owners, or students playing the owner)? This changes the background questions and how much weight the results carry.
5. **The scripted business and options:** which industry and currency, and are you happy that "best" means the model's best with a tempting-but-risky trap option? Do you want to choose the options yourself?
6. **What is "the coach"?** Is it right that the "off" group keeps the plain numbers and charts but loses everything inside the coach card (verdict, tiles, why bars, ideas) and the Today note? And should "Ask the coach" allow typed questions (with a warning, 200 characters) or only the three chips?
7. **Is the "describe it in your own words" box left out of the study for both groups?** (My recommendation: yes. The thesis then claims "the coach", not "natural-language input".)
8. **Assign before or after the background questions?** After lets me balance on experience (better with a small sample); before matches the order you wrote.
9. **Language:** English only for the screens, consent and SUS? (A translated SUS needs a validated translation.)
10. **Extras?** Optional short comprehension questions (for example "In how many of 10 futures does option C run out of cash?") to separate understanding from guessing; a few coach-trust items for the coach group only; a free-text "why did you choose this?" (I advise against it: it invites personal details). Anything not on your list stays out.
11. **Time limit?** No limit (I record time and stop nobody), or a soft limit such as 20 minutes?
12. **Withdrawal:** if someone withdraws, delete everything for their code (my default), or keep what they had given before withdrawing?

## 11. Decisions to record on approval

(Left empty on purpose. After you answer section 10, this section gets the answers, the `CLAUDE.md` "Current state" is updated, and the golden rules get one amendment line: *"study participants are separated in a dedicated database; the coach condition is enforced on the server only."*)
