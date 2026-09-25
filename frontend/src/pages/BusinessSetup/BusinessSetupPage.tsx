import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createBusiness, DEFAULT_BASELINE_FORM, type BaselineFormValues } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { NumberField } from "../../components/NumberField";
import { BASELINE_STEPS } from "../../constants";

type FieldErrors = Record<string, string>;

function validateStep(stepIndex: number, baseline: BaselineFormValues, name: string): FieldErrors {
  const errors: FieldErrors = {};
  if (stepIndex === 0 && name.trim().length === 0) {
    errors.name = "Give the business a name.";
  }
  for (const field of BASELINE_STEPS[stepIndex].fields) {
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
  const [name, setName] = useState("");
  const [baseline, setBaseline] = useState<BaselineFormValues>({ ...DEFAULT_BASELINE_FORM });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isLastStep = step === BASELINE_STEPS.length - 1;

  function updateField(key: string, value: number) {
    setBaseline((b) => ({ ...b, [key]: value }));
  }

  function goNext() {
    const stepErrors = validateStep(step, baseline, name);
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
    setSubmitting(true);
    setSubmitError(null);
    try {
      const business = await createBusiness(name.trim(), baseline);
      navigate(`/scenarios?business=${business.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const current = BASELINE_STEPS[step];

  return (
    <div className="page">
      <h1>New business</h1>
      <p className="step-indicator">
        Step {step + 1} of {BASELINE_STEPS.length}: {current.title}
      </p>

      {step === 0 && (
        <div className="field">
          <label htmlFor="business-name">Business name</label>
          <input
            id="business-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Corner Café"
          />
          <p className="field-help">Shown in scenario and run-history lists.</p>
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
      )}

      {current.fields.map((field) => (
        <NumberField
          key={field.key}
          label={field.label}
          help={field.help}
          unit={field.unit}
          min={field.min}
          max={field.max}
          step={field.step}
          value={baseline[field.key as keyof BaselineFormValues]}
          onChange={(v) => updateField(field.key, v)}
          error={errors[field.key]}
        />
      ))}

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
