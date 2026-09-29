import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  baselineApiToForm,
  createBusiness,
  DEFAULT_BASELINE_FORM,
  listIndustries,
  previewStartingMonth,
  type BaselineFormValues,
  type IndustryOut,
  type StartingMonth,
} from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { NumberField } from "../../components/NumberField";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { BASELINE_STEPS, CURRENCIES } from "../../constants";
import { DEFAULT_CURRENCY, formatUnit } from "../../lib/format";
import { heroImage } from "../../lib/images";
import { describeStartingMonth } from "../../lib/startSummary";

type FieldErrors = Record<string, string>;

const NAME_PLACEHOLDER: Record<string, string> = {
  cafe: "Corner Café",
  restaurant: "Downtown Bistro",
  bakery: "Sunrise Bakery",
};

function validateStep(
  step: number,
  baseline: BaselineFormValues,
  name: string,
  industryId: string | null,
): FieldErrors {
  const errors: FieldErrors = {};
  if (step === 0) {
    if (!industryId) errors.industry = "Choose a business type.";
    return errors;
  }
  const baselineStep = BASELINE_STEPS[step - 1];
  if (step === 1 && name.trim().length === 0) {
    errors.name = "Give the business a name.";
  }
  for (const field of baselineStep.fields) {
    const value = baseline[field.key as keyof BaselineFormValues];
    if (!Number.isFinite(value)) {
      errors[field.key] = "Enter a number.";
    } else if (value < field.min) {
      errors[field.key] = `Must be at least ${field.min}.`;
    } else if (field.max !== undefined && value > field.max) {
      errors[field.key] = `Must be at most ${field.max}.`;
    }
  }
  return errors;
}

export function BusinessSetupPage() {
  const navigate = useNavigate();
  const industries = useAsync(listIndustries, []);

  const [industryId, setIndustryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [baseline, setBaseline] = useState<BaselineFormValues>({ ...DEFAULT_BASELINE_FORM });
  // Money fields (unit has "{CUR}") that have been typed in. The example amounts are US dollars, so in
  // any other currency they stay highlighted until edited.
  const [editedMoney, setEditedMoney] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalSteps = BASELINE_STEPS.length + 1;
  const isLastStep = step === totalSteps - 1;

  // On the last step, ask the engine what a typical month looks like with these numbers.
  const [startMonth, setStartMonth] = useState<StartingMonth | null>(null);
  const [startMonthFailed, setStartMonthFailed] = useState(false);
  const allNumbersEntered = Object.values(baseline).every((v) => Number.isFinite(v));
  useEffect(() => {
    if (!isLastStep || !industryId || !allNumbersEntered) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      previewStartingMonth(industryId, baseline).then(
        (m) => {
          if (cancelled) return;
          setStartMonth(m);
          setStartMonthFailed(false);
        },
        () => !cancelled && setStartMonthFailed(true),
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLastStep, industryId, baseline, allNumbersEntered]);
  const startSummary = startMonth && isLastStep ? describeStartingMonth(startMonth, currency) : null;
  const selectedIndustry = industries.data?.find((i) => i.id === industryId) ?? null;
  const fieldLabels = selectedIndustry?.field_labels ?? {};

  function selectIndustry(industry: IndustryOut) {
    setIndustryId(industry.id);
    setBaseline(baselineApiToForm(industry.default_baseline));
    setEditedMoney(new Set());
    setErrors({});
  }

  function updateField(key: string, value: number) {
    setEditedMoney((s) => (s.has(key) ? s : new Set(s).add(key)));
    setBaseline((b) => ({ ...b, [key]: value }));
  }

  function goNext() {
    const stepErrors = validateStep(step, baseline, name, industryId);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    if (isLastStep) {
      void submit();
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (!industryId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const business = await createBusiness(name.trim(), industryId, currency, baseline);
      navigate(`/scenarios?business=${business.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const current = step === 0 ? null : BASELINE_STEPS[step - 1];
  const needsAmounts = (key: string, unit: string) =>
    currency !== "USD" && unit.includes("{CUR}") && !editedMoney.has(key);
  const stepHasUnedited = current?.fields.some((f) => needsAmounts(f.key, f.unit)) ?? false;
  const heading = selectedIndustry
    ? `Tell us about your ${selectedIndustry.display_name.toLowerCase()}`
    : "What kind of business do you run?";

  return (
    <div className="page">
      {selectedIndustry && step > 0 ? (
        <div className="hero-banner" style={{ backgroundImage: `url(${heroImage(selectedIndustry.id, "setup")})` }}>
          <h1>{heading}</h1>
        </div>
      ) : (
        <h1>{heading}</h1>
      )}
      <p className="step-indicator">
        Step {step + 1} of {totalSteps}: {step === 0 ? "Business type" : current!.title}
      </p>

      {step === 0 && (
        <div className="industry-picker">
          {industries.loading && <Spinner label="Loading business types…" />}
          <ErrorBanner message={industries.error} />
          {industries.data && (
            <div className="industry-cards">
              {industries.data.map((ind) => (
                <button
                  key={ind.id}
                  type="button"
                  className={ind.id === industryId ? "industry-card selected" : "industry-card"}
                  style={{ backgroundImage: `url(${heroImage(ind.id, "setup")})` }}
                  onClick={() => selectIndustry(ind)}
                >
                  <span className="industry-card-label">{ind.display_name}</span>
                </button>
              ))}
            </div>
          )}
          {errors.industry && <p className="field-error">{errors.industry}</p>}
        </div>
      )}

      {step >= 1 && (
        <p className="example-numbers-note">
          Example numbers are for a typical small US business — replace them with your own.
        </p>
      )}

      {step === 1 && (
        <>
          <div className="field">
            <label htmlFor="business-name">Business name</label>
            <input
              id="business-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={industryId ? NAME_PLACEHOLDER[industryId] : "Corner Café"}
            />
            <p className="field-help">Shown in scenario and run-history lists.</p>
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>

          <div className="field">
            <label htmlFor="business-currency">Currency</label>
            <select id="business-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <p className="field-help">Every money amount and chart uses this currency.</p>
          </div>
        </>
      )}

      {stepHasUnedited && (
        <p className="currency-notice" role="note">
          These example amounts are in US dollars — please enter your own amounts in {currency}.
        </p>
      )}

      {current?.fields.map((field) => (
        <NumberField
          key={field.key}
          highlight={needsAmounts(field.key, field.unit)}
          label={fieldLabels[field.key] ?? field.label}
          help={field.help}
          tooltip={field.help}
          unit={formatUnit(field.unit, currency)}
          min={field.min}
          max={field.max}
          step={field.step}
          value={baseline[field.key as keyof BaselineFormValues]}
          onChange={(v) => updateField(field.key, v)}
          error={errors[field.key]}
        />
      ))}

      {isLastStep && (
        <div className={startSummary?.isLoss ? "start-summary start-summary-loss" : "start-summary"} role="status">
          <h3>A typical month, with your numbers</h3>
          {!startSummary && !startMonthFailed && <p>Working it out…</p>}
          {startMonthFailed && <p>We couldn't work out the summary right now, but you can still continue.</p>}
          {startSummary && <p>{startSummary.text}</p>}
          {startSummary?.hint && <p className="start-summary-hint">{startSummary.hint}</p>}
        </div>
      )}

      <ErrorBanner message={submitError} />

      <div className="wizard-nav">
        <button type="button" onClick={goBack} disabled={step === 0 || submitting}>
          Back
        </button>
        <button type="button" onClick={goNext} disabled={submitting}>
          {isLastStep ? (submitting ? "Creating…" : "Create business") : "Next"}
        </button>
      </div>
    </div>
  );
}
