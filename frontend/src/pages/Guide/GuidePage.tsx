import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { changeGuideAnswers, createGuidePlan, getGuideOptions, getGuidePlan, type GuideCountry } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { LoadError } from "../../components/LoadError";
import { NumberField } from "../../components/NumberField";
import { Spinner } from "../../components/Spinner";
import { CURRENCIES } from "../../constants";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { formatUnit } from "../../lib/format";
import { heroImage } from "../../lib/images";
import {
  ALCOHOL_OPTIONS, DISCLAIMER, EMPTY_DRAFT, GUIDE_STEPS, MENU_OPTIONS, PREMISES_OPTIONS, SIZE_OPTIONS, STEP_TITLES, TIMELINE_OPTIONS,
  clearDraft, countryById, draftFromAnswers, loadDraft, needsOwnNumbers, saveDraft, stepFromParam, toAnswers, validateStep,
  type GuideDraft, type StepErrors,
} from "../../lib/guide";

/** Choice cards: big round options, one chosen. A radio group, so arrow keys and screen readers work. */
function Choices({ name, legend, value, options, onChange, error }: {
  name: string; legend: string; value: string | null; options: readonly { id: string; label: string; help?: string }[];
  onChange: (id: string) => void; error?: string;
}) {
  return (
    <fieldset className="guide-choices">
      <legend className="visually-hidden">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className={value === o.id ? "guide-choice guide-choice-on" : "guide-choice"}>
          <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span className="guide-choice-label">{o.label}</span>
          {o.help && <span className="guide-choice-help">{o.help}</span>}
        </label>
      ))}
      {error && <p className="field-error" role="alert">{error}</p>}
    </fieldset>
  );
}

/** The nine questions, one per screen. The screen number is in the address (?step=3), so refreshing keeps your place,
 *  and half-finished answers are kept in this tab only. With ?plan=ID it changes the answers of a plan you already made. */
export function GuidePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const planId = Number(params.get("plan")) || null;
  const options = useAsync(getGuideOptions, []);
  const editing = useAsync(() => (planId ? getGuidePlan(planId) : Promise.resolve(null)), [planId]);
  const [draft, setDraft] = useState<GuideDraft>(() => loadDraft() ?? EMPTY_DRAFT);
  const [errors, setErrors] = useState<StepErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  const stepIndex = stepFromParam(params.get("step"));
  const step = GUIDE_STEPS[stepIndex];
  const countries = options.data?.countries ?? [];
  const country = countryById(countries, draft.country);

  // Changing the answers of an existing plan starts from that plan's answers.
  useEffect(() => {
    if (planId && editing.data && loadedFor !== planId) {
      setDraft(draftFromAnswers(editing.data.plan.answers));
      setLoadedFor(planId);
    }
  }, [planId, editing.data, loadedFor]);

  useEffect(() => {
    track("screen_view", "guide", { step: stepIndex + 1 });
  }, [stepIndex]);

  function update(patch: Partial<GuideDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!planId) saveDraft(next);
  }

  function go(index: number) {
    const next = new URLSearchParams(params);
    next.set("step", String(index + 1));
    setParams(next, { replace: true });
    setErrors({});
    window.scrollTo?.({ top: 0 });
  }

  async function finish() {
    setBusy(true);
    setFailure(null);
    try {
      const answers = toAnswers(draft);
      const out = planId ? await changeGuideAnswers(planId, answers) : await createGuidePlan(answers);
      track("guide_plan_made", "guide", { business_type: out.plan.business_type, country: out.plan.country.id, changed: !!planId });
      clearDraft();
      navigate(`/guide/plan/${out.id}`);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "We couldn't make your plan just now. Please try again.");
      setBusy(false);
    }
  }

  function next() {
    const found = validateStep(step, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (stepIndex < GUIDE_STEPS.length - 1) go(stepIndex + 1);
    else void finish();
  }

  if (options.loading || (planId && editing.loading)) return <div className="page guide-page"><Spinner label="Getting the questions ready…" /></div>;
  if (options.error || !options.data) {
    return <div className="page guide-page"><LoadError message={options.error} what="the questions" onRetry={options.reload} /></div>;
  }
  if (planId && editing.error) {
    return <div className="page guide-page"><LoadError message={editing.error} what="that plan" onRetry={editing.reload} /></div>;
  }

  const { question, why } = STEP_TITLES[step];
  const currency = draft.currency || country?.currency || "USD";
  const last = stepIndex === GUIDE_STEPS.length - 1;
  const typeName = options.data.business_types.find((t) => t.id === draft.business_type)?.name.toLowerCase() ?? "business";

  return (
    <div className="page guide-page">
      <p className="guide-progress" role="status">
        Question {stepIndex + 1} of {GUIDE_STEPS.length}
        <span className="guide-progress-bar" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / GUIDE_STEPS.length) * 100}%` }} />
        </span>
      </p>
      <section className="guide-card" aria-labelledby="guide-question">
        <h1 id="guide-question" tabIndex={-1}>{question}</h1>
        <p className="guide-why">{why}</p>

        {step === "type" && (
          <div className="industry-cards">
            {options.data.business_types.map((t) => (
              <button
                key={t.id} type="button" aria-pressed={draft.business_type === t.id}
                className={draft.business_type === t.id ? "industry-card selected" : "industry-card"}
                style={{ backgroundImage: `url(${heroImage(t.id, "setup")})` }} onClick={() => update({ business_type: t.id })}
              >
                <span className="industry-card-label">{t.name}</span>
              </button>
            ))}
          </div>
        )}
        {step === "type" && errors.business_type && <p className="field-error" role="alert">{errors.business_type}</p>}

        {step === "country" && (
          <>
            <Choices
              name="country" legend="Country" value={draft.country} error={errors.country}
              options={countries.map((c: GuideCountry) => ({ id: c.id, label: c.name }))}
              onChange={(id) => update({ country: id, currency: countryById(countries, id)?.currency ?? "USD" })}
            />
            {country && (
              <p className="guide-mode" role="note">
                {country.mode === "full" && "We have sourced pay and cost figures for this country."}
                {country.mode === "own_numbers" && `We have sourced pay figures and the official rules for ${country.name}, but not cost totals. You will type your own rent and ingredient cost, and we do the arithmetic.`}
                {country.mode === "checklist_only" && "We have no sourced figures for this country, so you will get the checklist and a list of what to ask locally, with no cost numbers."}
              </p>
            )}
            {country?.mode === "checklist_only" && (
              <div className="field currency-pick">
                <label htmlFor="guide-currency">Currency for any amounts you type</label>
                <select id="guide-currency" value={draft.currency} onChange={(e) => update({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        {step === "budget" && (
          <NumberField
            label="Money you can put in" help="Everything you could spend before and just after opening. Leave it empty if you are not sure."
            tooltip="We compare this with the start-up cost, a cushion for surprises and some months of running costs."
            unit={formatUnit("{CUR}", currency)} value={draft.budget} onChange={(v) => update({ budget: v })} error={errors.budget}
          />
        )}

        {step === "premises" && (
          <>
            <Choices name="premises" legend="Premises" value={draft.premises} options={PREMISES_OPTIONS} error={errors.premises} onChange={(id) => update({ premises: id })} />
            {(draft.premises === "ready" || draft.premises === "fit_out") && (
              <NumberField
                label="Rent a month" help="About how much rent do you expect? Leave it empty if you do not know."
                tooltip="Ask a local commercial agent. We have no figure for your street."
                unit={formatUnit("{CUR}/month", currency)} value={draft.rent} onChange={(v) => update({ rent: v })} error={errors.rent}
              />
            )}
          </>
        )}

        {step === "size" && <Choices name="size" legend="Size" value={draft.size} options={SIZE_OPTIONS} error={errors.size} onChange={(id) => update({ size: id })} />}

        {step === "serve" && (
          <>
            <h2 className="guide-sub">Menu</h2>
            <Choices name="menu" legend="Menu" value={draft.menu} options={MENU_OPTIONS} error={errors.menu} onChange={(id) => update({ menu: id })} />
            <h2 className="guide-sub">Will you sell alcohol?</h2>
            <Choices name="alcohol" legend="Alcohol" value={draft.alcohol} options={ALCOHOL_OPTIONS} error={errors.alcohol} onChange={(id) => update({ alcohol: id })} />
          </>
        )}

        {step === "people" && (
          <NumberField
            label="People who work there" help="Count yourself as one. Two part-timers count as one."
            tooltip="Staff are treated as full-time people, the same rule the simulator uses."
            unit="full-time people" value={draft.people} onChange={(v) => update({ people: v })} error={errors.people}
          />
        )}

        {step === "customers" && (
          <>
            <NumberField
              label="Customers on a normal day" help={`How many customers do you hope for on an ordinary day at your ${typeName}? Leave it empty if you are not sure.`}
              tooltip="If you leave it empty, we show the number you would need to break even."
              unit="per day" value={draft.customers_per_day} onChange={(v) => update({ customers_per_day: v })} error={errors.customers_per_day}
            />
            <NumberField
              label="What one customer spends" help="The price of a typical order. Leave it empty if you are not sure."
              tooltip="We cannot work out break-even without it, and we will not guess it for you."
              unit={formatUnit("{CUR}/visit", currency)} value={draft.avg_spend} onChange={(v) => update({ avg_spend: v })} error={errors.avg_spend}
            />
            {needsOwnNumbers(country) && (
              <NumberField
                label="Ingredient share of sales" help="Roughly what share of each sale goes on ingredients? Ask a supplier what the ingredients for your best-seller cost."
                tooltip={`We found no published figure for ${country?.name}, so this one is yours.`}
                unit="% of sales" value={draft.ingredient_share} onChange={(v) => update({ ingredient_share: v })} error={errors.ingredient_share}
              />
            )}
          </>
        )}

        {step === "timeline" && <Choices name="timeline" legend="When" value={draft.timeline} options={TIMELINE_OPTIONS} error={errors.timeline} onChange={(id) => update({ timeline: id })} />}

        <ErrorBanner message={failure} />
        <p className="guide-disclaimer">{DISCLAIMER}</p>

        <div className="wizard-nav">
          <button type="button" className="secondary" disabled={stepIndex === 0 || busy} onClick={() => go(stepIndex - 1)}>
            Previous
          </button>
          <button type="button" className={last ? "btn-amber" : undefined} disabled={busy} onClick={next}>
            {busy ? "Working it out…" : last ? (planId ? "Save my changes" : "Show my rough plan") : "Next"}
          </button>
        </div>
      </section>
    </div>
  );
}
