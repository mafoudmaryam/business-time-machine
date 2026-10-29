import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { calculateSalesNeeded, getBusiness } from "../../api";
import { CURRENCIES } from "../../constants";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { getRememberedBusinessId } from "../../lib/session";
import { formatDailyAverage, formatToolCount, formatToolMoney, validateToolField, type SalesNeededField, type SalesNeededInput, type SalesNeededResult } from "../../lib/salesNeeded";

const QUESTIONS: { field: SalesNeededField; title: string; label: string; example: string; help: string }[] = [
  { field: "selling_price", title: "What do you charge for one sale?", label: "Selling price for one sale", example: "For example: one haircut, one repair job or one item from your shop. Use the price your customer actually pays after discounts.", help: "Use amounts on a consistent basis throughout, including how you treat tax." },
  { field: "cost_per_sale", title: "What does each sale cost you?", label: "Costs for each sale", example: "For example: a replacement part for a repair, packaging for an item, payment fees, or work you pay for only when that job happens. Add these up for one sale.", help: "Count each cost once. If you include pay here because it varies per job, do not also count the same pay in monthly costs. Enter 0 if there is no cost per sale." },
  { field: "monthly_costs", title: "What do you pay even in a quiet month?", label: "Monthly costs regardless of sales", example: "For example: rent, insurance, subscriptions or a monthly salary you owe even with no sales. Add these up for one month.", help: "Do not repeat costs already counted for each sale. Include owner pay only if you choose to cover it here. Enter 0 if there are no monthly costs." },
  { field: "opening_days", title: "Would a daily average help?", label: "Opening days per month (optional)", example: "Enter the number of days you expect to open in a month, from 1 to 31. Leave this blank if you only want the monthly target.", help: "This only spreads the monthly target across opening days. It does not change how many monthly sales cover your costs." },
];
const EMPTY: SalesNeededInput = { selling_price: "", cost_per_sale: "", monthly_costs: "", opening_days: "" };

function Calculator({ currency, businessId }: { currency: string; businessId: number | null }) {
  const [inputs, setInputs] = useState<SalesNeededInput>({ ...EMPTY });
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SalesNeededResult | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusInput = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const question = QUESTIONS[step];
  const money = (value: string) => formatToolMoney(value, currency);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (result) heading.current?.focus();
    else if (focusInput.current) { input.current?.focus(); focusInput.current = false; }
  }, [result, step]);

  function edit() {
    focusInput.current = true;
    setResult(null); setError(null); setRequestError(false); setStep(0);
  }
  async function next(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = validateToolField(question.field, inputs[question.field]);
    setError(invalid); setRequestError(false);
    if (invalid) { input.current?.focus(); return; }
    if (step < 3) { focusInput.current = true; setStep(step + 1); return; }
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const answer = await calculateSalesNeeded({ ...inputs }, abort.signal);
      if (!abort.signal.aborted) setResult(answer);
    } catch {
      if (!abort.signal.aborted) setRequestError(true);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }

  if (!result) return <form className="sales-tool-card" onSubmit={event => void next(event)} noValidate aria-labelledby="tool-question">
    <p className="tool-progress">Step {step + 1} of 4</p>
    <h2 id="tool-question">{question.title}</h2>
    <p id="tool-example">{question.example}</p>
    <div className="field">
      <label htmlFor="tool-input">{question.label}{step < 3 ? ` (${currency})` : ""}</label>
      <input ref={input} id="tool-input" type="text" inputMode={step === 3 ? "numeric" : "decimal"}
        autoComplete="off" maxLength={32} required={step < 3} disabled={busy}
        value={inputs[question.field]} aria-invalid={error ? true : undefined}
        aria-describedby={`tool-example tool-help${error ? " tool-error" : ""}`}
        onChange={event => { setInputs({ ...inputs, [question.field]: event.target.value }); setError(null); }} />
      <p className="field-help" id="tool-help">{question.help}</p>
      {error && <p className="field-error" id="tool-error" role="alert">{error}</p>}
    </div>
    {requestError && <p role="alert" className="field-error">We could not calculate your target. Your amounts are still here. Check that the backend is running and try again.</p>}
    <div className="tool-actions">
      {step > 0 && <button type="button" className="secondary" disabled={busy} onClick={() => { focusInput.current = true; setError(null); setRequestError(false); setStep(step - 1); }}>Back</button>}
      <button type="submit" disabled={busy}>{busy ? "Working it out…" : step === 3 ? "Work out my target" : "Next"}</button>
    </div>
    <p className="field-help">Nothing is copied into your business or saved as a plan.</p>
  </form>;

  const noMonthlyCosts = result.monthly_costs === "0";
  return <section className="sales-tool-card tool-result" aria-labelledby="tool-result-title">
    <p className="tool-progress">Your entered-cost target</p>
    <h2 id="tool-result-title" ref={heading} tabIndex={-1}>{result.status === "target"
      ? `You need approximately ${formatToolCount(result.monthly_sales!)} ${result.monthly_sales === "1" ? "sale" : "sales"} per month to cover these costs.`
      : "Check your price and per-sale costs"}</h2>
    {result.status === "target" ? <>
      {noMonthlyCosts && <p>You entered no monthly costs. Zero sales cover that entered monthly amount; this does not mean your business has no other costs.</p>}
      {result.daily_average !== null && <p className="tool-daily">An average target of <strong>{formatDailyAverage(result.daily_average)} {result.daily_average === "1" ? "sale" : "sales"} per opening day</strong>, spread across {result.opening_days} days per month.</p>}
      <h3>Here is why</h3>
      <p>Each sale brings in {money(result.selling_price)}. After {money(result.cost_per_sale)} in per-sale costs, {money(result.contribution_per_sale)} remains to cover your {money(result.monthly_costs)} in monthly costs.</p>
      <figure className="tool-breakdown">
        <figcaption>Where the money from one sale goes</figcaption>
        <div className="tool-breakdown-bar" aria-hidden="true">
          <span className="tool-sale-cost" style={{ width: `${result.cost_share_percent}%` }} />
          <span className="tool-sale-left" style={{ flex: 1 }} />
        </div>
        <dl className="tool-legend"><div><dt>Costs for that sale</dt><dd>{money(result.cost_per_sale)}</dd></div><div><dt>Left for monthly costs</dt><dd>{money(result.contribution_per_sale)}</dd></div></dl>
      </figure>
    </> : <>
      <h3>Here is why</h3>
      <p>Your selling price of {money(result.selling_price)} does not exceed the {money(result.cost_per_sale)} cost of each sale.</p>
      <p>{result.contribution_per_sale === "0" ? "Each sale leaves nothing for monthly costs." : `Each sale loses ${money(result.contribution_per_sale.replace("-", ""))} before monthly costs.`} Selling more cannot cover positive monthly costs under these assumptions.</p>
      {noMonthlyCosts && <p>You entered no monthly costs to cover, but this price still leaves no money for other costs.</p>}
      <p>Review the price and costs you entered. There is no useful sales target to show with these amounts.</p>
    </>}
    <h3>What is included—and what to check</h3>
    <p>This uses only the price, per-sale cost and monthly costs you entered. Each cost must appear once, not in both cost boxes.</p>
    <p>Check whether tax, refunds, owner pay, loan payments or any other costs still need to be included. {result.status === "target" && result.monthly_sales !== "0" ? "Could you realistically attract and serve this many sales?" : "Review these amounts before deciding what to change."}</p>
    <p className="tool-limit">Covering entered costs is not a guarantee of overall profitability. This calculation treats every sale as the single item, appointment, job or representative sale you chose. A changing mix of prices and costs needs a separate check.</p>
    <details className="page-details"><summary>See my amounts and the calculation</summary>
      <dl className="tool-amounts"><div><dt>Selling price per sale</dt><dd>{money(result.selling_price)}</dd></div><div><dt>Costs for each sale</dt><dd>{money(result.cost_per_sale)}</dd></div><div><dt>Monthly costs</dt><dd>{money(result.monthly_costs)}</dd></div><div><dt>Opening days</dt><dd>{result.opening_days ?? "Not entered—no daily average"}</dd></div></dl>
      <p>Monthly sales needed = monthly costs ÷ (selling price − cost per sale). The monthly count is rounded upward to a whole sale.</p>
      {result.monthly_revenue !== null && <p>At the rounded monthly target, sales before costs total {money(result.monthly_revenue)}. This is income, not profit.</p>}
      {result.daily_average !== null && <p>The daily figure divides the rounded monthly count by opening days and rounds up to two decimal places. It is an average target, not a promise or a requirement to sell a fraction of an item each day.</p>}
    </details>
    <button type="button" onClick={edit}>Edit these amounts</button>
    <p className="field-help">Nothing has been saved to your business or plans.</p>
    <p className="tool-handoff">Want to explore what a change might do? {businessId !== null ? <Link to="/explore">Explore an idea in the simulator</Link> : <Link to="/">Set up a business to explore an idea</Link>}. These tool amounts are not transferred.</p>
  </section>;
}

export function SalesNeededPage() {
  const id = getRememberedBusinessId();
  const business = useAsync(() => id !== null ? getBusiness(id) : Promise.resolve(null), [id]);
  const [guestCurrency, setGuestCurrency] = useState("");
  const title = <><p className="page-eyebrow">Tools</p><h1>How much do I need to sell?</h1><p className="try-lead">Work out the sales needed to cover the costs you enter. “Break-even” means selling enough to cover these costs.</p></>;
  if (id !== null && business.error) return <div className="page sales-tool">{title}<LoadError message={business.error} what="your business currency" onRetry={business.reload} /><p>We need your selected business currency before showing amounts. No costs have been assumed.</p></div>;
  if (id !== null && (business.loading || business.data?.id !== id)) return <div className="page sales-tool">{title}<Spinner label="Loading your business currency…" /></div>;
  const currency = id !== null ? business.data!.currency : guestCurrency;
  return <div className="page sales-tool">
    {title}
    <p className="tool-intro">For one item, appointment or job—or a representative sale you choose. Different products can have different prices and costs. Start with your own amounts; we do not fill in costs for you.</p>
    {id !== null ? <p className="field-help">Currency: {currency} · {business.data!.name}. Your saved business numbers stay unchanged.</p> : <div className="field tool-currency">
      <label htmlFor="tool-currency">Choose your currency</label>
      <select id="tool-currency" value={guestCurrency} onChange={event => setGuestCurrency(event.target.value)}><option value="">Choose a currency…</option>{CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</select>
      <p className="field-help">Changing currency starts a fresh calculation. Amounts are not converted.</p>
    </div>}
    {currency && <Calculator key={`${id ?? "guest"}:${currency}`} currency={currency} businessId={id} />}
  </div>;
}
