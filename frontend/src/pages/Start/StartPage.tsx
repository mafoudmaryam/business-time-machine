import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createQuickBusiness,
  createSampleBusiness,
  listBusinesses,
  listIndustries,
  quickBaseline,
  type BusinessOut,
  type QuickStartOut,
} from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { NumberField } from "../../components/NumberField";
import { Spinner } from "../../components/Spinner";
import { CURRENCIES } from "../../constants";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { DEFAULT_CURRENCY, formatMoney, formatUnit } from "../../lib/format";
import { heroImage } from "../../lib/images";
import { rememberBusiness } from "../../lib/session";
import { describeStartingMonth } from "../../lib/startSummary";
import { defaultBusinessName, toAnswers, validateAnswers, type AnswerDraft } from "../../lib/todayView";

const WHO: Record<string, string> = { cafe: "customers", restaurant: "guests", bakery: "customers" };

const EMPTY: AnswerDraft = { customers_per_day: NaN, avg_spend: NaN, monthly_rent: NaN, staff: NaN };

/** The key numbers shown in "what we assumed" before the business is created. */
function assumedLines(quick: QuickStartOut, currency: string): { label: string; text: string }[] {
  const rule = (field: string) => quick.assumed.find((a) => a.field === field)?.rule ?? "";
  const b = quick.baseline;
  return [
    { label: "Rent and other bills", text: `${formatMoney(b.fixed_costs, currency)} a month: ${rule("fixed_costs")}.` },
    { label: "Cash in the bank", text: `${formatMoney(b.cash, currency)}: ${rule("cash")}.` },
    { label: "Staff", text: `${b.staff_fte} ${b.staff_fte === 1 ? "person" : "people"}: ${rule("staff_fte")}.` },
    { label: "Marketing", text: `${formatMoney(b.marketing, currency)} a month: ${rule("marketing")}.` },
  ];
}

export function StartPage() {
  const navigate = useNavigate();
  const industries = useAsync(listIndustries, []);
  const [existing, setExisting] = useState<BusinessOut[]>([]);
  useEffect(() => {
    let cancelled = false;
    listBusinesses().then((b) => !cancelled && setExisting(b), () => undefined);
    track("screen_view", "start");
    return () => {
      cancelled = true;
    };
  }, []);

  const [step, setStep] = useState(0);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [answers, setAnswers] = useState<AnswerDraft>({ ...EMPTY });
  const [errors, setErrors] = useState<Partial<Record<keyof AnswerDraft, string>>>({});
  const [quick, setQuick] = useState<QuickStartOut | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pickError, setPickError] = useState(false);

  const industry = industries.data?.find((i) => i.id === industryId) ?? null;
  const noun = industry ? industry.display_name.toLowerCase() : "business";
  const who = industryId ? (WHO[industryId] ?? "customers") : "customers";

  function chooseIndustry(id: string) {
    setIndustryId(id);
    setPickError(false);
    setQuick(null);
    setFailure(null);
    track("industry_picked", "start", { industry: id });
  }

  function enter(business: BusinessOut, how: string) {
    rememberBusiness(business.id);
    track("business_created", "start", { how, industry: business.industry });
    navigate("/today");
  }

  async function trySample(id: string) {
    setBusy(true);
    setFailure(null);
    try {
      enter(await createSampleBusiness(id, currency), "sample");
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toSummary() {
    const found = validateAnswers(answers);
    setErrors(found);
    if (Object.keys(found).length > 0 || !industryId) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await quickBaseline(industryId, toAnswers(answers));
      setQuick(result);
      setName((n) => n || defaultBusinessName(industryId));
      setStep(2);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!industryId || !quick) return;
    setBusy(true);
    setFailure(null);
    try {
      enter(await createQuickBusiness(name.trim() || defaultBusinessName(industryId), industryId, currency, quick), "quick");
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function setAnswer(key: keyof AnswerDraft, value: number) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  const summary = quick ? describeStartingMonth(quick.preview, currency) : null;

  return (
    <div className="page start-page">
      <h1>{step === 0 ? "What kind of business do you run?" : step === 1 ? `Tell us about your ${noun}` : "Here is what we worked out"}</h1>
      <p className="step-indicator">
        Step {step + 1} of 3
        {" · "}
        <span>Amounts in {currency}</span>{" "}
        <button type="button" className="link-button" onClick={() => setPickingCurrency((p) => !p)} aria-expanded={pickingCurrency}>
          Change currency
        </button>
      </p>
      {pickingCurrency && (
        <div className="field currency-pick">
          <label htmlFor="start-currency">Currency</label>
          <select id="start-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="field-help">Every amount in the app uses this currency.</p>
        </div>
      )}

      {step === 0 && (
        <>
          {industries.loading && <Spinner label="Loading business types…" />}
          <ErrorBanner message={industries.error} />
          {industries.data && (
            <div className="industry-cards">
              {industries.data.map((ind) => (
                <div key={ind.id} className="industry-choice">
                  <button
                    type="button"
                    aria-pressed={ind.id === industryId}
                    className={ind.id === industryId ? "industry-card selected" : "industry-card"}
                    style={{ backgroundImage: `url(${heroImage(ind.id, "setup")})` }}
                    onClick={() => chooseIndustry(ind.id)}
                  >
                    <span className="industry-card-label">{ind.display_name}</span>
                  </button>
                  <button type="button" className="link-button" disabled={busy} onClick={() => void trySample(ind.id)}>
                    Try a sample {ind.display_name.toLowerCase()}
                  </button>
                </div>
              ))}
            </div>
          )}
          {pickError && <p className="field-error" role="alert">Choose a business type first.</p>}
          <p className="start-note">No numbers handy? Try a sample: a made-up {noun} you can play with in one click.</p>
        </>
      )}

      {step === 1 && (
        <>
          <p className="example-numbers-note">
            Just four questions. We fill in the rest with typical numbers for a small {noun}, and show you what we guessed.
          </p>
          <NumberField
            label={`${who[0].toUpperCase()}${who.slice(1)} on a normal day`}
            help={`Roughly how many ${who} come in on an ordinary day.`}
            tooltip={`Count everyone who buys something on a normal day, not your busiest or quietest.`}
            unit="per day"
            value={answers.customers_per_day}
            onChange={(v) => setAnswer("customers_per_day", v)}
            error={errors.customers_per_day}
          />
          <NumberField
            label="Average spend per customer"
            help="What one customer pays in a visit, on average."
            tooltip="Take a typical day's sales and divide by the number of customers."
            unit={formatUnit("{CUR}/visit", currency)}
            value={answers.avg_spend}
            onChange={(v) => setAnswer("avg_spend", v)}
            error={errors.avg_spend}
          />
          <NumberField
            label="Monthly rent"
            help="What you pay to rent the place each month (0 if you own it)."
            tooltip="Just the rent. We add a rough amount for utilities and other bills."
            unit={formatUnit("{CUR}/month", currency)}
            value={answers.monthly_rent}
            onChange={(v) => setAnswer("monthly_rent", v)}
            error={errors.monthly_rent}
          />
          <NumberField
            label="People who work there"
            help="Count everyone as a full-time person. Two part-timers count as one. You can count yourself."
            tooltip="Staff are treated as full-time people, so two part-timers count as one."
            unit="full-time people"
            value={answers.staff}
            onChange={(v) => setAnswer("staff", v)}
            error={errors.staff}
          />
        </>
      )}

      {step === 2 && quick && summary && (
        <>
          <div className={summary.isLoss ? "start-summary start-summary-loss" : "start-summary"} role="status">
            <h3>A typical month, with your numbers</h3>
            <p>{summary.text}</p>
            {summary.hint && <p className="start-summary-hint">{summary.hint}</p>}
          </div>
          {quick.warnings.map((w) => (
            <p key={w} className="currency-notice" role="note">
              {w}
            </p>
          ))}
          <div className="assumed-box">
            <h3>What we assumed</h3>
            <p className="field-help">
              These are guesses, not facts about your business. You can change any of them later on the Today page.
            </p>
            <dl className="assumed-list">
              {assumedLines(quick, currency).map((l) => (
                <div key={l.label}>
                  <dt>{l.label}</dt>
                  <dd>{l.text}</dd>
                </div>
              ))}
            </dl>
            <p className="field-help">
              Everything else (pay per person, ingredient costs, how often regulars come back) is typical for a small{" "}
              {noun}.{currency !== "USD" && ` Those typical amounts are US dollars, so please check them in ${currency}.`}
            </p>
          </div>
          <div className="field">
            <label htmlFor="start-name">What is it called?</label>
            <input id="start-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </>
      )}

      <ErrorBanner message={failure} />

      <div className="wizard-nav">
        <button
          type="button"
          className="secondary"
          disabled={step === 0 || busy}
          onClick={() => {
            setErrors({});
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          Back
        </button>
        {step === 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!industryId) {
                setPickError(true);
                return;
              }
              setErrors({});
              setStep(1);
            }}
          >
            Next
          </button>
        )}
        {step === 1 && (
          <button type="button" disabled={busy} onClick={() => void toSummary()}>
            {busy ? "Working it out…" : "Next"}
          </button>
        )}
        {step === 2 && (
          <button type="button" disabled={busy} onClick={() => void create()}>
            {busy ? "Setting up…" : "Looks right, show me"}
          </button>
        )}
      </div>

      {step === 0 && existing.length > 0 && (
        <section className="continue-box" aria-labelledby="my-businesses">
          <h2 id="my-businesses">My businesses</h2>
          <p className="field-help">Already set one up? Pick it to carry on. Nothing is opened unless you choose it.</p>
          <ul>
            {[...existing].reverse().map((b) => (
              <li key={b.id}>
                <button type="button" className="secondary" onClick={() => enter(b, "continue")}>
                  Continue with {b.name}
                </button>
                {b.is_sample && <span className="sample-tag">Sample business</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
