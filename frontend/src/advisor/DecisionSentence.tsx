import { useState, type FormEvent } from "react";
import type { BaselineFormValues, DecisionFormValues } from "../api";
import { currencySymbol, formatMoney, formatPrice } from "../lib/format";
import { decisionProblems, LATEST_START_MONTH } from "../lib/decisionDraft";
import { InlineNumber } from "./InlineNumber";

interface Props {
  initial: DecisionFormValues;
  staffNoun: string;
  currency: string;
  /** Today's numbers, so the advisor can say "Right now: $6.50 a visit". */
  baseline: BaselineFormValues | null;
  onDone: (decision: DecisionFormValues) => void;
  onCancel: () => void;
}

/** Splits a signed number into a direction and an amount, for "Raise / Cut by [10]%". */
function directionOf(value: number): 1 | -1 {
  return value < 0 ? -1 : 1;
}

/** One decision, written as a sentence you fill in -- the way you'd say it out loud. */
export function DecisionSentence({ initial, staffNoun, currency, baseline, onDone, onCancel }: Props) {
  const [d, setD] = useState<DecisionFormValues>(initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);
  const cur = currencySymbol(currency);
  const money = (v: number) => formatMoney(v, currency);

  function set<K extends keyof DecisionFormValues>(key: K, value: DecisionFormValues[K]) {
    setD((old) => ({ ...old, [key]: value }));
  }

  /** For "Raise/Cut by [amount]": keep the sign in the stored value. */
  function setSigned(direction: 1 | -1, amount: number) {
    set("value", Number.isNaN(amount) ? NaN : direction * Math.abs(amount));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = decisionProblems(d);
    setProblems(found);
    if (Object.keys(found).length === 0) onDone(d);
  }

  const month = (
    <>
      from month{" "}
      <InlineNumber
        label="Starting month"
        value={d.start_month}
        width={2}
        invalid={!!problems.start_month}
        onChange={(v) => set("start_month", Number.isNaN(v) ? NaN : Math.round(v))}
      />
    </>
  );
  const dir = directionOf(d.value);
  const amount = Number.isNaN(d.value) ? NaN : Math.abs(d.value);

  let sentence;
  let now: string | null = null;
  let switchUnit: { label: string; unit: string; value: number } | null = null;
  let more = null;

  switch (d.type) {
    case "price":
      if (d.unit === "absolute") {
        sentence = (
          <>
            Set my average sale to {cur}
            <InlineNumber label="New average sale" value={d.value} invalid={!!problems.value} onChange={(v) => set("value", v)} />{" "}
            {month}
          </>
        );
        switchUnit = { label: "Change by a percentage instead", unit: "percent", value: 10 };
      } else {
        sentence = (
          <>
            <select aria-label="Raise or cut" value={dir} onChange={(e) => setSigned(Number(e.target.value) as 1 | -1, amount)}>
              <option value={1}>Raise</option>
              <option value={-1}>Cut</option>
            </select>{" "}
            my prices by{" "}
            <InlineNumber label="Price change in percent" value={amount} width={3} invalid={!!problems.value} onChange={(v) => setSigned(dir, v)} />
            % {month}
          </>
        );
        switchUnit = { label: "Set an exact price instead", unit: "absolute", value: baseline ? Math.round(baseline.avg_ticket * 110) / 100 : 7 };
      }
      if (baseline) now = `Right now a typical customer spends ${formatPrice(baseline.avg_ticket, currency)} per visit.`;
      break;

    case "hiring":
      sentence = (
        <>
          <select aria-label="Hire or let go" value={dir} onChange={(e) => setSigned(Number(e.target.value) as 1 | -1, amount)}>
            <option value={1}>Hire</option>
            <option value={-1}>Let go of</option>
          </select>{" "}
          <InlineNumber label={`Number of ${staffNoun}s`} value={amount} width={3} invalid={!!problems.value} onChange={(v) => setSigned(dir, v)} />{" "}
          full-time {staffNoun}
          {amount === 1 ? "" : "s"} {month}
        </>
      );
      if (baseline) now = `Right now you have ${baseline.staff_fte} full-time staff. Half-time counts as 0.5.`;
      break;

    case "marketing":
      if (d.unit === "per_month") {
        sentence = (
          <>
            Spend {cur}
            <InlineNumber label="Monthly marketing spend" value={d.value} width={5} invalid={!!problems.value} onChange={(v) => set("value", v)} /> a month on
            marketing {month}
          </>
        );
        switchUnit = { label: "Change by a percentage instead", unit: "percent", value: 20 };
      } else {
        sentence = (
          <>
            Spend{" "}
            <InlineNumber label="Marketing change in percent" value={amount} width={3} invalid={!!problems.value} onChange={(v) => setSigned(dir, v)} />%{" "}
            <select aria-label="More or less" value={dir} onChange={(e) => setSigned(Number(e.target.value) as 1 | -1, amount)}>
              <option value={1}>more</option>
              <option value={-1}>less</option>
            </select>{" "}
            on marketing {month}
          </>
        );
        switchUnit = { label: "Set an exact monthly amount instead", unit: "per_month", value: baseline ? baseline.marketing * 2 : 800 };
      }
      if (baseline) now = `Right now you spend ${money(baseline.marketing)} a month on marketing.`;
      break;

    case "hours":
      sentence = (
        <>
          Open <InlineNumber label="Open days per month" value={d.value} width={2} invalid={!!problems.value} onChange={(v) => set("value", v)} /> days a
          month {month}
        </>
      );
      if (baseline) now = `Right now you open ${baseline.open_days} days a month.`;
      break;

    case "menu":
      sentence = (
        <>
          A typical customer spends{" "}
          <InlineNumber label="Menu change in percent" value={amount} width={3} invalid={!!problems.value} onChange={(v) => setSigned(dir, v)} />%{" "}
          <select aria-label="More or less per visit" value={dir} onChange={(e) => setSigned(Number(e.target.value) as 1 | -1, amount)}>
            <option value={1}>more</option>
            <option value={-1}>less</option>
          </select>{" "}
          {month}
        </>
      );
      more = (
        <>
          <p className="sentence sentence-small">
            <label>
              <input
                type="checkbox"
                checked={d.cogs_ratio !== undefined}
                onChange={(e) => set("cogs_ratio", e.target.checked ? (baseline?.cogs_ratio ?? 30) : undefined)}
              />{" "}
              Ingredients change too:
            </label>{" "}
            {d.cogs_ratio !== undefined && (
              <>
                they become{" "}
                <InlineNumber label="New ingredient costs in percent of sales" value={d.cogs_ratio} width={2} invalid={!!problems.cogs_ratio} onChange={(v) => set("cogs_ratio", v)} />% of
                sales
              </>
            )}
          </p>
          <p className="sentence sentence-small">
            A one-off cost to set it up: {cur}
            <InlineNumber
              label="One-off setup cost"
              value={d.investment ?? 0}
              width={5}
              invalid={!!problems.investment}
              onChange={(v) => set("investment", v === 0 ? undefined : v)}
            />
          </p>
        </>
      );
      if (baseline) now = `Right now a typical customer spends ${formatPrice(baseline.avg_ticket, currency)} per visit.`;
      break;

    case "investment":
      sentence = (
        <>
          Spend {cur}
          <InlineNumber label="Equipment cost" value={d.value} width={6} invalid={!!problems.value} onChange={(v) => set("value", v)} /> on equipment{" "}
          {month}
        </>
      );
      more = (
        <>
          <p className="sentence sentence-small">
            Pay it off over{" "}
            <InlineNumber label="Loan months" value={d.loan_months ?? 0} width={3} invalid={!!problems.loan_months} onChange={(v) => set("loan_months", Number.isNaN(v) ? NaN : Math.round(v))} />{" "}
            months (0 = pay it all now) at{" "}
            <InlineNumber label="Yearly interest in percent" value={d.annual_rate ?? 0} width={3} invalid={!!problems.annual_rate} onChange={(v) => set("annual_rate", v)} />% a
            year
          </p>
          <p className="sentence sentence-small">
            It lets me serve{" "}
            <InlineNumber label="Extra capacity in percent" value={d.capacity_pct ?? 0} width={3} invalid={!!problems.capacity_pct} onChange={(v) => set("capacity_pct", v)} />% more
            customers when it's busy
          </p>
        </>
      );
      break;
  }

  const problemList = Object.values(problems);

  return (
    <form className="sentence-form" onSubmit={submit} noValidate>
      <p className="sentence">{sentence}</p>
      {now && <p className="sentence-now">{now}</p>}

      {more && (
        <>
          {!moreOpen && (d.type === "investment" || d.type === "menu") && (
            <button type="button" className="text-button" onClick={() => setMoreOpen(true)}>
              {d.type === "investment" ? "+ Loan or extra capacity" : "+ Ingredients or a setup cost"}
            </button>
          )}
          {moreOpen && more}
        </>
      )}

      {switchUnit && (
        <button type="button" className="text-button" onClick={() => setD((old) => ({ ...old, unit: switchUnit!.unit, value: switchUnit!.value }))}>
          {switchUnit.label}
        </button>
      )}

      {problemList.length > 0 && (
        <p className="form-problem" role="alert">
          {problemList[0]}
        </p>
      )}

      <div className="reply-row">
        <button type="submit" className="chip chip-primary">
          Add to my plan
        </button>
        <button type="button" className="chip" onClick={onCancel}>
          Something else
        </button>
      </div>
      <p className="sentence-hint">Month 1 is the first month from now. You can plan up to {LATEST_START_MONTH} months ahead.</p>
    </form>
  );
}
