import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  ApiError,
  askCoach,
  baselineApiToForm,
  createBusiness,
  createScenario,
  decisionOutToForm,
  getScenario,
  getSimulationRun,
  listBusinesses,
  listIndustries,
  listScenarios,
  previewStartingMonth,
  simulateBusiness,
  type BaselineFormValues,
  type BusinessOut,
  type CoachIdea,
  type DecisionFormValues,
  type IndustryOut,
  type ScenarioOut,
  type SimulationRunOut,
} from "../api";
import { BASELINE_STEPS, CURRENCIES, DECISION_TYPES, MAX_SCENARIOS_PER_RUN, type DecisionType } from "../constants";
import { buildIdeaPrefill } from "../lib/coachIdea";
import {
  baselineProblems,
  decisionChoiceLabel,
  decisionQuestion,
  defaultDecision,
  findSamePlan,
  planName,
} from "../lib/decisionDraft";
import { decisionSummary } from "../lib/decisionSummary";
import { DEFAULT_CURRENCY, formatPrice } from "../lib/format";
import { friendlyErrorMessage } from "../lib/friendlyError";
import { decisionTypeImage, heroImage } from "../lib/images";
import { describeStartingMonth } from "../lib/startSummary";
import { AdvisorAvatar, AdvisorBubble, Typing, YouBubble } from "./Bubbles";
import { CoachBubble } from "./CoachBubble";
import { friendlyCoachError, useCoach, useCoachStatus } from "./coachStore";
import { DecisionSentence } from "./DecisionSentence";
import { IdeaCards } from "./IdeaCards";
import { NumbersCard } from "./NumbersCard";
import { pathName } from "../lib/paths";
import { ResultBubble } from "./ResultBubble";

/* =====================================================================
   The advisor: the whole app is one conversation.

   How it works, in short:
   - `messages` is the chat so far (advisor on the left, you on the right).
   - `step` says what the advisor is waiting for right now. Only the current
     step shows buttons or boxes to fill in (the "reply area" at the bottom),
     so there is always exactly one thing to do.
   - Every answer adds your bubble, then the advisor's next message(s), then
     moves to the next step.
   - Numbers only ever come from the engine (through the backend). The
     advisor's own sentences are fixed text written in this file.
   ===================================================================== */

type Step =
  | { kind: "busy" }
  | { kind: "chooseBusiness" }
  | { kind: "industry" }
  | { kind: "name" }
  | { kind: "numbers"; group: number | "all" }
  | { kind: "checkMonth" }
  | { kind: "pickDecision" }
  | { kind: "details"; draft: DecisionFormValues }
  | { kind: "confirm" }
  | { kind: "result" }
  | { kind: "compare" }
  | { kind: "decided" };

interface Message {
  id: number;
  from: "advisor" | "you";
  wide?: boolean;
  /** Messages that render their own bubble (like the coach's). */
  raw?: boolean;
  node: ReactNode;
}

const HORIZONS = [12, 24, 36];
const GROUP_QUESTIONS = [
  "First, your customers and sales:",
  "Now your costs and staff:",
  "Last one: how much cash do you have in the bank today?",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AdvisorPage({ typingDelayMs = 450 }: { typingDelayMs?: number }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  // ---------- the conversation ----------
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "busy" });
  const [problem, setProblem] = useState<string | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  // ---------- what we know ----------
  const [businesses, setBusinesses] = useState<BusinessOut[]>([]);
  const [industries, setIndustries] = useState<IndustryOut[]>([]);
  const [business, setBusiness] = useState<BusinessOut | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioOut[]>([]);

  // Setting up a new business
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [baseline, setBaseline] = useState<BaselineFormValues | null>(null);
  const [editedMoney, setEditedMoney] = useState<Set<string>>(new Set());
  const [fieldProblems, setFieldProblems] = useState<Record<string, string>>({});

  // The plan being put together, and what has been simulated in this conversation
  const [plan, setPlan] = useState<DecisionFormValues[]>([]);
  const [planParentId, setPlanParentId] = useState<number | undefined>(undefined);
  const [run, setRun] = useState<SimulationRunOut | null>(null);
  const [triedIds, setTriedIds] = useState<number[]>([]);
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [question, setQuestion] = useState("");

  const industry =
    industries.find((i) => i.id === (business?.industry ?? industryId)) ?? null;
  const staffNoun = industry?.staff_noun ?? "staff member";
  const money = business?.currency ?? currency;
  const businessBaseline = business?.baseline ? baselineApiToForm(business.baseline) : null;

  const coachStatus = useCoachStatus();
  const coach = useCoach(run?.id ?? null);
  const coachReady = coach?.state === "ready" && coach.coach ? coach.coach : null;
  const coachOn = coachStatus?.enabled !== false && coach?.state !== "off";

  // ---------- small helpers for talking ----------
  function push(from: Message["from"], node: ReactNode, extra: Partial<Message> = {}) {
    setMessages((m) => [...m, { id: nextId.current++, from, node, ...extra }]);
  }

  function you(text: ReactNode) {
    push("you", text);
  }

  /** The advisor says one or more things, with a short "typing…" pause before each. */
  async function say(...nodes: ReactNode[]) {
    for (const node of nodes) {
      if (typingDelayMs > 0) {
        setTyping(true);
        await sleep(typingDelayMs);
        setTyping(false);
      }
      push("advisor", node);
    }
  }

  async function sayWide(node: ReactNode) {
    if (typingDelayMs > 0) {
      setTyping(true);
      await sleep(typingDelayMs);
      setTyping(false);
    }
    push("advisor", node, { wide: true });
  }

  function errorText(err: unknown): string {
    if (err instanceof ApiError && err.status === 0) return "I can't reach the app right now. Is it running?";
    const message = err instanceof Error ? err.message : String(err);
    return friendlyErrorMessage(message);
  }

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [messages.length, step.kind, typing]);

  // ---------- starting the conversation ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bs, inds] = await Promise.all([listBusinesses(), listIndustries()]);
        if (cancelled) return;
        setBusinesses(bs);
        setIndustries(inds);

        const reopenRunId = (location.state as { reopenRunId?: number } | null)?.reopenRunId;
        const fromUrl = bs.find((b) => b.id === Number(params.get("business")));

        if (reopenRunId) {
          await reopen(reopenRunId, bs, inds);
        } else if (fromUrl) {
          await enterBusiness(fromUrl, `Welcome back to ${fromUrl.name}! What decision is on your mind?`);
        } else if (bs.length === 0) {
          await say(
            "Hi! I'm your business advisor. Before you make a decision, I'll show you what it could do to your business.",
            "First, tell me a little about it. What kind of business do you run?",
          );
          setStep({ kind: "industry" });
        } else {
          await say("Hi again! Which business are we thinking about today?");
          setStep({ kind: "chooseBusiness" });
        }
      } catch (err) {
        if (!cancelled) {
          await say(errorText(err));
          setProblem("reload");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once when the conversation starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadScenarios(businessId: number) {
    try {
      setScenarios(await listScenarios(businessId));
    } catch {
      setScenarios([]);
    }
  }

  function rememberBusiness(b: BusinessOut) {
    setBusiness(b);
    setParams({ business: String(b.id) }, { replace: true, state: location.state });
  }

  async function enterBusiness(b: BusinessOut, greeting: string) {
    rememberBusiness(b);
    void loadScenarios(b.id);
    await say(greeting);
    setStep({ kind: "pickDecision" });
  }

  async function reopen(runId: number, bs: BusinessOut[], inds: IndustryOut[]) {
    const old = await getSimulationRun(runId);
    const b = bs.find((x) => x.id === old.business_id);
    if (b) rememberBusiness(b);
    if (b) void loadScenarios(b.id);
    const names = old.results.slice(1).map(pathName).join(" vs. ");
    await say(`Here's “${names}” again, the way it looked on ${new Date(old.created_at).toLocaleDateString()}.`);
    showResult(old, b ?? null, inds);
  }

  // ---------- setting up a new business ----------
  async function chooseIndustry(ind: IndustryOut) {
    you(ind.display_name);
    setIndustryId(ind.id);
    setBaseline(baselineApiToForm(ind.default_baseline));
    setEditedMoney(new Set());
    setStep({ kind: "busy" });
    await say(`Lovely, a ${ind.display_name.toLowerCase()}! What's it called, and which currency do you use?`);
    setStep({ kind: "name" });
  }

  async function submitName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setProblem("Give your business a name.");
      return;
    }
    setProblem(null);
    you(`${name.trim()} · ${currency}`);
    setStep({ kind: "busy" });
    await say(
      `Now a few numbers about how ${name.trim()} runs today. I've filled in a typical small US ${industry?.display_name.toLowerCase() ?? "business"}, so just change what's different for you.`,
      GROUP_QUESTIONS[0],
    );
    setStep({ kind: "numbers", group: 0 });
  }

  function changeNumber(key: string, value: number) {
    setEditedMoney((s) => (s.has(key) ? s : new Set(s).add(key)));
    setBaseline((b) => (b ? { ...b, [key]: value } : b));
  }

  function numbersSummary(group: number | "all"): string {
    if (!baseline) return "";
    const fields = group === "all" ? BASELINE_STEPS.flatMap((s) => s.fields) : BASELINE_STEPS[group].fields;
    const labels = industry?.field_labels ?? {};
    return fields
      .map((f) => {
        const value = baseline[f.key as keyof BaselineFormValues];
        let shown: string;
        if (f.unit.includes("{CUR}")) {
          const per = f.unit.split("/")[1]; // "{CUR}/month" -> "month"
          shown = `${formatPrice(value, currency)}${per ? ` a ${per}` : ""}`;
        } else if (f.unit.startsWith("%")) {
          shown = `${value}%`;
        } else {
          shown = `${value.toLocaleString()} ${f.unit.replace("/month", " a month")}`;
        }
        return `${labels[f.key] ?? f.label}: ${shown}`;
      })
      .join(" · ");
  }

  async function numbersDone(group: number | "all") {
    if (!baseline) return;
    const fields = group === "all" ? BASELINE_STEPS.flatMap((s) => s.fields) : BASELINE_STEPS[group].fields;
    const found = baselineProblems(fields, baseline);
    setFieldProblems(found);
    if (Object.keys(found).length > 0) return;
    you(numbersSummary(group));
    setStep({ kind: "busy" });
    if (group !== "all" && group < BASELINE_STEPS.length - 1) {
      await say(GROUP_QUESTIONS[group + 1]);
      setStep({ kind: "numbers", group: group + 1 });
      return;
    }
    await checkTypicalMonth();
  }

  async function checkTypicalMonth() {
    if (!baseline || !industryId) return;
    try {
      const m = await previewStartingMonth(industryId, baseline);
      const s = describeStartingMonth(m, currency);
      await say(
        <>
          With those numbers, a typical month looks like this: <strong>{s.text}</strong>
          {s.hint && <span className="warning-text"> {s.hint}</span>} Does that sound about right?
        </>,
      );
    } catch {
      await say("I couldn't work out a typical month right now, but we can carry on. Does everything look right?");
    }
    setStep({ kind: "checkMonth" });
  }

  async function saveBusiness() {
    if (!baseline || !industryId) return;
    you("Yes, that's about right");
    setStep({ kind: "busy" });
    try {
      const b = await createBusiness(name.trim(), industryId, currency, baseline);
      setBusinesses((bs) => [...bs, b]);
      rememberBusiness(b);
      setScenarios([]);
      await say(`All set, ${b.name} is saved.`, "Now, what decision is on your mind?");
      setStep({ kind: "pickDecision" });
    } catch (err) {
      await say(`I couldn't save that: ${errorText(err)}`);
      setStep({ kind: "checkMonth" });
    }
  }

  async function fixNumbers() {
    you("Let me change a number");
    setStep({ kind: "busy" });
    await say("Of course. Change anything below:");
    setStep({ kind: "numbers", group: "all" });
  }

  // ---------- choosing and describing a decision ----------
  async function pickBusiness(b: BusinessOut) {
    you(b.name);
    setStep({ kind: "busy" });
    await enterBusiness(b, "Great. What decision is on your mind?");
  }

  async function newBusiness() {
    you("A new business");
    setBusiness(null);
    setPlan([]);
    setRun(null);
    setName("");
    setStep({ kind: "busy" });
    await say("Let's set it up. What kind of business is it?");
    setStep({ kind: "industry" });
  }

  async function switchBusiness() {
    you("Talk about a different business");
    setStep({ kind: "busy" });
    await say("Sure. Which one?");
    setStep({ kind: "chooseBusiness" });
  }

  async function pickDecision(type: DecisionType) {
    you(decisionChoiceLabel(type, staffNoun));
    setStep({ kind: "busy" });
    await say(decisionQuestion(type, staffNoun));
    setStep({ kind: "details", draft: defaultDecision(type, businessBaseline) });
  }

  async function addToPlan(d: DecisionFormValues) {
    const newPlan = [...plan, d];
    setPlan(newPlan);
    you(decisionSummary(d, staffNoun, money));
    setStep({ kind: "busy" });
    await say(
      newPlan.length === 1
        ? "Got it. Is that the whole plan, or does something else change at the same time?"
        : "Added. Here's the plan now:",
    );
    setStep({ kind: "confirm" });
  }

  async function notThis() {
    you("Something else");
    setStep({ kind: "busy" });
    await say("No problem. What decision is on your mind?");
    setStep({ kind: "pickDecision" });
  }

  async function addAnother() {
    you("Add another change");
    setStep({ kind: "busy" });
    await say("What else would change?");
    setStep({ kind: "pickDecision" });
  }

  async function startOver() {
    you("Start over");
    setPlan([]);
    setPlanParentId(undefined);
    setStep({ kind: "busy" });
    await say("Okay, a fresh start. What decision is on your mind?");
    setStep({ kind: "pickDecision" });
  }

  function removeStep(index: number) {
    setPlan((p) => p.filter((_, i) => i !== index));
  }

  // ---------- looking into the future ----------

  /** The human-in-the-loop moment: nothing is saved or simulated until the owner says yes
   * to the plan exactly as it's shown. Only then are the decisions marked as confirmed. */
  async function confirmPlan() {
    if (!business || plan.length === 0) return;
    you("Yes, show me the future");
    setStep({ kind: "busy" });
    try {
      // Tried this exact plan before? Reuse it rather than saving a copy.
      let saved = findSamePlan(plan, scenarios);
      if (!saved) {
        const name = planName(
          plan.map((d) => decisionSummary(d, staffNoun, money)),
          scenarios.map((s) => s.name),
        );
        saved = await createScenario(
          business.id,
          name,
          plan.map((d) => ({ ...d, confirmed: true })),
          planParentId,
        );
        const created = saved;
        setScenarios((s) => [...s, created]);
      }
      setTriedIds((ids) => [...ids.filter((x) => x !== saved.id), saved.id]);
      setPlan([]);
      setPlanParentId(undefined);
      await simulate([saved.id], 24);
    } catch (err) {
      await say(`Something went wrong: ${errorText(err)}`);
      setStep({ kind: "confirm" });
    }
  }

  async function simulate(scenarioIds: number[], horizon: number) {
    if (!business) return;
    if (typingDelayMs > 0) setTyping(true);
    try {
      const result = await simulateBusiness(business.id, scenarioIds, horizon);
      setTyping(false);
      showResult(result);
    } catch (err) {
      setTyping(false);
      await say(`I couldn't run that: ${errorText(err)}`);
      setStep({ kind: "pickDecision" });
    }
  }

  /** `forBusiness`/`inds` are passed when the page state may not be updated yet (right at the start). */
  function showResult(result: SimulationRunOut, forBusiness: BusinessOut | null = business, inds: IndustryOut[] = industries) {
    setRun(result);
    setUsedQuestions(new Set());
    const noun = inds.find((i) => i.id === forBusiness?.industry)?.customer_noun ?? "customers";
    push("advisor", <ResultBubble run={result} currency={forBusiness?.currency ?? DEFAULT_CURRENCY} customerNoun={noun} />, {
      wide: true,
    });
    push("advisor", <CoachBubble runId={result.id} />, { raw: true });
    setStep({ kind: "result" });
  }

  async function lookFurther(horizon: number) {
    if (!run) return;
    you(`Look ${horizon} months ahead`);
    setStep({ kind: "busy" });
    const ids = run.results.map((r) => r.scenario_id).filter((x): x is number => x !== null);
    await simulate(ids, horizon);
  }

  // Questions answered from the coach's notes (no extra waiting: the coach already wrote them).
  async function askPrepared(key: "why" | "watch" | "ideas") {
    if (!coachReady || !run) return;
    setUsedQuestions((s) => new Set(s).add(key));
    if (key === "why") {
      you("Why?");
      await say(coachReady.why);
    } else if (key === "watch") {
      you("What could go wrong?");
      await say(
        coachReady.watch_out.length ? (
          <>
            A few things to keep an eye on:
            <ul>
              {coachReady.watch_out.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        ) : (
          "Nothing alarming shows up, but check in on your regulars and your cash every few months."
        ),
      );
    } else {
      you("Any other ideas?");
      const currencyNow = money;
      await sayWide(
        coachReady.ideas.length ? (
          <>
            <p>Here are a few I tested on the same possible futures:</p>
            <IdeaCards ideas={coachReady.ideas} currency={currencyNow} onTry={tryIdea} />
          </>
        ) : (
          "Nothing else stands out right now. You could try a different decision."
        ),
      );
    }
  }

  async function tryIdea(idea: CoachIdea) {
    let parent: ScenarioOut | null = null;
    if (idea.builds_on_scenario_id) {
      parent =
        scenarios.find((s) => s.id === idea.builds_on_scenario_id) ??
        (await getScenario(idea.builds_on_scenario_id).catch(() => null));
    }
    const prefill = buildIdeaPrefill(idea, parent);
    setPlan(prefill.decisions);
    setPlanParentId(prefill.parentScenarioId);
    you(`Let's try: ${idea.title}`);
    setStep({ kind: "busy" });
    await say("Here it is as a plan. Check each step, and say yes only if it's right for you:");
    setStep({ kind: "confirm" });
  }

  async function askFree(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || !run) return;
    setQuestion("");
    you(q);
    if (typingDelayMs > 0) setTyping(true);
    try {
      const res = await askCoach(run.id, q);
      setTyping(false);
      push("advisor", res.answer);
    } catch (err) {
      setTyping(false);
      push("advisor", friendlyCoachError(err));
    }
  }

  async function differentDecision() {
    you("Try a different decision");
    setStep({ kind: "busy" });
    await say("Sure. What else are you considering?");
    setStep({ kind: "pickDecision" });
  }

  const comparable = scenarios.filter((s) => s.decisions.every((d) => d.confirmed));

  async function startCompare() {
    you("Compare my ideas");
    setCompareIds(triedIds.slice(-MAX_SCENARIOS_PER_RUN));
    setStep({ kind: "busy" });
    await say(`Which ideas should we put side by side? Pick up to ${MAX_SCENARIOS_PER_RUN}.`);
    setStep({ kind: "compare" });
  }

  async function runCompare() {
    if (compareIds.length === 0) return;
    const names = compareIds.map((id) => scenarios.find((s) => s.id === id)?.name ?? `#${id}`);
    you(`Compare ${names.join(", ")}`);
    setStep({ kind: "busy" });
    await simulate(compareIds, run?.horizon ?? 24);
  }

  async function goWith(scenarioName: string, scenarioId: number | null) {
    you(`I'll go with “${scenarioName}”`);
    setStep({ kind: "busy" });
    const chosen = scenarios.find((s) => s.id === scenarioId);
    const watch = coachReady?.watch_out ?? [];
    await sayWide(
      <div className="decision-card">
        <p className="decision-card-title">Your decision</p>
        <p className="decision-card-name">{scenarioName}</p>
        {chosen && (
          <ol>
            {chosen.decisions.map((d) => (
              <li key={d.id}>
                {decisionSummary(decisionOutToForm(d), staffNoun, money)}
              </li>
            ))}
          </ol>
        )}
        {watch.length > 0 && (
          <>
            <p className="decision-card-title">Keep an eye on</p>
            <ul>
              {watch.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}
        <p className="small-print">Good luck! You can find this again under “Past decisions”.</p>
      </div>,
    );
    setStep({ kind: "decided" });
  }

  // ---------- what you can do right now (the reply area) ----------
  function replyArea(): ReactNode {
    switch (step.kind) {
      case "busy":
        return null;

      case "chooseBusiness":
        return (
          <div className="reply-row">
            {businesses.map((b) => (
              <button key={b.id} type="button" className="chip" onClick={() => pickBusiness(b)}>
                {b.name}
              </button>
            ))}
            <button type="button" className="chip chip-quiet" onClick={newBusiness}>
              + A new business
            </button>
          </div>
        );

      case "industry":
        return (
          <div className="photo-choices">
            {industries.map((ind) => (
              <button key={ind.id} type="button" className="photo-choice" onClick={() => chooseIndustry(ind)}>
                <img src={heroImage(ind.id, "setup")} alt="" />
                <span>{ind.display_name}</span>
              </button>
            ))}
          </div>
        );

      case "name":
        return (
          <form className="reply-form" onSubmit={submitName}>
            <label className="reply-label" htmlFor="business-name">
              Business name
            </label>
            <input
              id="business-name"
              className="reply-input"
              value={name}
              autoFocus
              placeholder="e.g. Sunrise Bakery"
              onChange={(e) => setName(e.target.value)}
            />
            <label className="reply-label" htmlFor="business-currency">
              Currency
            </label>
            <select id="business-currency" className="reply-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {problem && problem !== "reload" && (
              <p className="form-problem" role="alert">
                {problem}
              </p>
            )}
            <button type="submit" className="chip chip-primary">
              Continue
            </button>
          </form>
        );

      case "numbers": {
        if (!baseline) return null;
        const fields = step.group === "all" ? BASELINE_STEPS.flatMap((s) => s.fields) : BASELINE_STEPS[step.group].fields;
        const group = step.group;
        return (
          <form
            className="reply-form reply-form-wide"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void numbersDone(group);
            }}
          >
            <NumbersCard
              fields={fields}
              baseline={baseline}
              currency={currency}
              fieldLabels={industry?.field_labels ?? {}}
              editedMoney={editedMoney}
              problems={fieldProblems}
              onChange={changeNumber}
            />
            <button type="submit" className="chip chip-primary">
              {group === "all" || group === BASELINE_STEPS.length - 1 ? "That's my business" : "Next"}
            </button>
          </form>
        );
      }

      case "checkMonth":
        return (
          <div className="reply-row">
            <button type="button" className="chip chip-primary" onClick={saveBusiness}>
              Yes, that's about right
            </button>
            <button type="button" className="chip" onClick={fixNumbers}>
              Let me change a number
            </button>
          </div>
        );

      case "pickDecision":
        return (
          <>
            <div className="photo-choices photo-choices-small">
              {DECISION_TYPES.map((t) => (
                <button key={t} type="button" className="photo-choice" onClick={() => pickDecision(t)}>
                  {industry && <img src={decisionTypeImage(industry.id, t)} alt="" />}
                  <span>{decisionChoiceLabel(t, staffNoun)}</span>
                </button>
              ))}
            </div>
            <div className="reply-row reply-row-quiet">
              {plan.length > 0 && (
                <button type="button" className="text-button" onClick={() => setStep({ kind: "confirm" })}>
                  ← Back to my plan
                </button>
              )}
              {businesses.length > 1 && (
                <button type="button" className="text-button" onClick={switchBusiness}>
                  Talk about a different business
                </button>
              )}
            </div>
          </>
        );

      case "details":
        return (
          <DecisionSentence
            key={messages.length}
            initial={step.draft}
            staffNoun={staffNoun}
            currency={money}
            baseline={businessBaseline}
            onDone={addToPlan}
            onCancel={notThis}
          />
        );

      case "confirm":
        return (
          <div className="plan">
            <p className="plan-title">Your plan</p>
            <ol className="plan-steps">
              {plan.map((d, i) => (
                <li key={i}>
                  <span>{decisionSummary(d, staffNoun, money)}</span>
                  {d.source === "ai" && <span className="tag">Coach's idea</span>}
                  <button type="button" className="text-button" onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ol>
            {plan.length === 0 && <p className="muted">The plan is empty. Add a change to continue.</p>}
            <div className="reply-row">
              <button type="button" className="chip chip-primary" onClick={confirmPlan} disabled={plan.length === 0}>
                Yes, show me the future
              </button>
              <button type="button" className="chip" onClick={addAnother}>
                Add another change
              </button>
              <button type="button" className="chip chip-quiet" onClick={startOver}>
                Start over
              </button>
            </div>
          </div>
        );

      case "result": {
        const choices = run?.results.slice(1) ?? [];
        return (
          <>
            {coachReady && coachOn && (
              <div className="reply-row">
                {!usedQuestions.has("why") && (
                  <button type="button" className="chip" onClick={() => askPrepared("why")}>
                    Why?
                  </button>
                )}
                {!usedQuestions.has("watch") && (
                  <button type="button" className="chip" onClick={() => askPrepared("watch")}>
                    What could go wrong?
                  </button>
                )}
                {!usedQuestions.has("ideas") && (
                  <button type="button" className="chip" onClick={() => askPrepared("ideas")}>
                    Any other ideas?
                  </button>
                )}
              </div>
            )}
            <div className="reply-row">
              {choices.map((r) => (
                <button key={r.scenario_name} type="button" className="chip chip-primary" onClick={() => goWith(pathName(r), r.scenario_id)}>
                  {choices.length === 1 ? "I'll go with this" : `Go with “${pathName(r)}”`}
                </button>
              ))}
              <button type="button" className="chip" onClick={differentDecision}>
                Try a different decision
              </button>
              {comparable.length >= 2 && (
                <button type="button" className="chip" onClick={startCompare}>
                  Compare my ideas
                </button>
              )}
            </div>
            <div className="look-ahead" role="group" aria-label="How far ahead to look">
              <span>Look ahead:</span>
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={run?.horizon === h ? "seg is-on" : "seg"}
                  aria-pressed={run?.horizon === h}
                  onClick={() => run?.horizon !== h && lookFurther(h)}
                >
                  {h} months
                </button>
              ))}
            </div>
          </>
        );
      }

      case "compare":
        return (
          <div className="plan">
            <ul className="compare-list">
              {comparable.map((s) => {
                const checked = compareIds.includes(s.id);
                const full = !checked && compareIds.length >= MAX_SCENARIOS_PER_RUN;
                return (
                  <li key={s.id}>
                    <label className={full ? "is-disabled" : undefined}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={full}
                        onChange={() =>
                          setCompareIds((ids) => (checked ? ids.filter((x) => x !== s.id) : [...ids, s.id]))
                        }
                      />{" "}
                      {s.name}
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="reply-row">
              <button type="button" className="chip chip-primary" onClick={runCompare} disabled={compareIds.length === 0}>
                Compare these
              </button>
              <button type="button" className="chip chip-quiet" onClick={() => setStep({ kind: "result" })}>
                Never mind
              </button>
            </div>
          </div>
        );

      case "decided":
        return (
          <div className="reply-row">
            <button type="button" className="chip chip-primary" onClick={differentDecision}>
              Think about another decision
            </button>
          </div>
        );
    }
  }

  const canAsk = run !== null && coachOn && (step.kind === "result" || step.kind === "decided");

  return (
    <div className="advisor">
      <header className="advisor-intro">
        <AdvisorAvatar size={56} />
        <h1>{business ? business.name : "Your business advisor"}</h1>
        <p>Think a decision through before you make it.</p>
      </header>

      <div className="chat" role="log" aria-live="polite">
        {messages.map((m) =>
          m.raw ? (
            <div key={m.id}>{m.node}</div>
          ) : m.from === "you" ? (
            <YouBubble key={m.id}>{m.node}</YouBubble>
          ) : (
            <AdvisorBubble key={m.id} wide={m.wide}>
              {m.node}
            </AdvisorBubble>
          ),
        )}
        {typing && <Typing />}
        {!typing && problem === "reload" && (
          <div className="reply">
            <button type="button" className="chip" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}
        {!typing && step.kind !== "busy" && <div className="reply">{replyArea()}</div>}
        <div ref={endRef} />
      </div>

      {canAsk && (
        <form className="ask-bar" onSubmit={askFree}>
          <label htmlFor="ask" className="visually-hidden">
            Your question
          </label>
          <input
            id="ask"
            value={question}
            maxLength={500}
            placeholder="Ask your advisor anything about this…"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="chip chip-primary" disabled={question.trim() === "" || typing}>
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
