import { useEffect, useRef, useState } from "react";
import type { JournalDue, JournalEntryOut, JournalMonthOut } from "../../api";
import { saveJournalEntry } from "../../api";
import { track } from "../../lib/events";
import { monthLabel, monthOptions, parseAmount, startingMonth } from "../../lib/journalView";

interface Props {
  businessId: number;
  currency: string;
  existing: JournalMonthOut[];
  due: JournalDue[];
  requestedMonth: string | null;
  onSaved: (saved: JournalMonthOut, edited: boolean) => void;
  now?: Date;
  onMonthSelected?: (month: string) => void;
}

export function JournalForm({ businessId, currency, existing, due, requestedMonth, onSaved, now, onMonthSelected }: Props) {
  const clock = now ?? new Date();
  const [month, setMonth] = useState(() => requestedMonth ?? startingMonth(due, clock));
  const [seen, setSeen] = useState(requestedMonth);
  if (seen !== requestedMonth) { setSeen(requestedMonth); if (requestedMonth) setMonth(requestedMonth); }
  const savedMonth = existing.find(m => m.entry.month === month);
  const current = savedMonth?.entry ?? null;
  const entryCurrency = savedMonth?.currency ?? currency;
  const options = monthOptions(clock);
  if (!options.some(o => o.value === month)) options.push({ value: month, label: monthLabel(month) });
  // Preserve corrections to older entries even outside the usual twelve-month picker.
  for (const m of existing) if (!options.some(o => o.value === m.entry.month)) options.push({ value: m.entry.month, label: m.entry.month_label });
  return <JournalFields key={`${businessId}:${month}:${JSON.stringify(current)}`} {...{ businessId, month, current, onSaved, options }} currency={entryCurrency} onMonth={value => { setMonth(value); onMonthSelected?.(value); }} scrollTo={requestedMonth} />;
}

type Field = "sales" | "costs" | "cash" | "visits" | "profit";
const LABELS: Record<Field, string> = { sales: "Sales money earned", costs: "Costs incurred", cash: "Month-end cash balance (optional)", visits: "Customer visits (optional)", profit: "Reported profit or loss (optional)" };
function text(value: number | null | undefined) { return value == null ? "" : String(value); }

function JournalFields({ businessId, currency, month, current, onMonth, onSaved, options, scrollTo }: {
  businessId: number; currency: string; month: string; current: JournalEntryOut | null;
  onMonth: (month: string) => void; onSaved: Props["onSaved"]; options: {value:string;label:string}[]; scrollTo: string | null;
}) {
  const [values, setValues] = useState<Record<Field, string>>(() => ({ sales: text(current?.actual_sales), costs: text(current?.actual_costs), cash: text(current?.actual_cash), visits: text(current?.actual_visits), profit: text(current?.actual_profit) }));
  const [complete, setComplete] = useState(current?.costs_complete ?? false);
  const [note, setNote] = useState(current?.note ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (scrollTo) { form.current?.scrollIntoView?.({ block: "start" }); form.current?.querySelector<HTMLInputElement>("input")?.focus(); } }, [scrollTo]);
  const hasBreakdown = values.sales.trim() !== "" || values.costs.trim() !== "";

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const found: typeof errors = {};
    const parsed = {} as Record<Field, number | null>;
    for (const field of Object.keys(values) as Field[]) {
      const raw = field === "profit" && hasBreakdown ? "" : values[field].trim();
      parsed[field] = raw === "" ? null : parseAmount(raw);
      const value = parsed[field];
      if (value !== null && (!Number.isFinite(value) || Math.abs(value) > (field === "visits" ? 1e9 : 1e12))) found[field] = "Enter a valid amount within the supported range.";
      else if (value !== null && value < 0 && field !== "profit" && field !== "cash") found[field] = "Use 0 or a positive amount.";
    }
    if (Object.values(parsed).every(v => v === null)) found.form = "Enter at least one actual figure. Leave unknown amounts blank; enter 0 only when it was zero.";
    if (complete && (parsed.sales === null || parsed.costs === null)) found.form = "Enter both sales and costs before confirming all costs are included.";
    setErrors(found); setProblem(null);
    if (Object.keys(found).length) {
      const field = Object.keys(found).find(k => k !== "form");
      const target = form.current?.querySelector<HTMLInputElement>(field ? `#journal-${field}` : "input");
      const panel = target?.closest("details"); if (panel) panel.open = true;
      target?.focus(); return;
    }
    setBusy(true);
    try {
      const saved = await saveJournalEntry(businessId, { month, actual_sales: parsed.sales, actual_costs: parsed.costs, costs_complete: complete,
        actual_profit: hasBreakdown ? null : parsed.profit, actual_cash: parsed.cash, actual_visits: parsed.visits, note: note.trim() || null });
      if (!mounted.current) return;
      track("journal_saved", "journal", { edited: current !== null, compared: saved.has_prediction });
      onSaved(saved, current !== null);
    } catch { if (mounted.current) setProblem("We couldn't save that just now. Your entries are still here. Please try again."); }
    finally { if (mounted.current) setBusy(false); }
  }
  function field(name: Field, help: string) { return <div className="field">
    <label htmlFor={`journal-${name}`}>{LABELS[name]}{name !== "visits" ? ` (${currency})` : ""}</label>
    <input id={`journal-${name}`} type="text" inputMode="decimal" value={values[name]} maxLength={32} disabled={busy}
      onChange={e => setValues(v => ({ ...v, [name]: e.target.value }))} aria-invalid={errors[name] ? true : undefined}
      aria-describedby={`journal-${name}-help${errors[name] ? ` journal-${name}-error` : ""}`} />
    <p className="field-help" id={`journal-${name}-help`}>{help}</p>
    {errors[name] && <p className="field-error" role="alert" id={`journal-${name}-error`}>{errors[name]}</p>}
  </div>; }
  return <form ref={form} className="journal-form" onSubmit={e => void submit(e)} noValidate aria-labelledby="journal-form-title">
    <h2 id="journal-form-title">{current ? "Correct this month’s figures" : "Record a month"}</h2>
    <div className="field"><label htmlFor="journal-month">Which month?</label><select id="journal-month" value={month} disabled={busy} onChange={e => onMonth(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
    <p className="field-help">Use the same calendar month for every figure. This month may still be incomplete. Leave unknown amounts blank; enter 0 only if it was zero.</p>
    {current && <p className="field-help">Saving corrects this same record. Its saved comparison plan stays unchanged.</p>}
    {field("sales", "Money earned from sales in this month, even if customers pay later. For example: completed jobs or items sold. Do not include a loan as sales.")}
    {field("costs", "Costs belonging to this month, even if paid later: for example supplies used, wages, rent and fees. Count each cost once. Loan repayments and equipment purchases are not automatically this month’s costs.")}
    <label className="journal-complete"><input type="checkbox" checked={complete} disabled={busy} onChange={e => setComplete(e.target.checked)} /> I have included all costs for this month</label>
    <p className="field-help">We calculate profit or loss only when sales and costs are entered and this is checked. Otherwise the balance is before unrecorded costs. Check tax and accounting treatment if unsure.</p>
    {hasBreakdown && current?.actual_profit != null && !current.costs_complete && <p className="field-help">These sales and costs will replace the earlier reported profit. Without complete costs, profit will be unknown.</p>}
    <details className="page-details"><summary>Optional cash balance, visits and notes</summary>
      {field("cash", "Cash in the bank and till at month end. This is a balance, not cash received or paid during the month. Those cash flows are not recorded by this journal.")}
      {field("visits", "A rough count is fine. Leave blank if you do not know.")}
      {!hasBreakdown && field("profit", "If you already know profit or loss from your accounts, you can record it directly. Use a minus sign for a loss. It is owner-reported; we cannot verify which costs it includes.")}
      <div className="field"><label htmlFor="journal-note">A note for yourself (optional)</label><textarea id="journal-note" rows={2} maxLength={1000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></div>
    </details>
    {errors.form && <p role="alert" className="field-error">{errors.form}</p>}
    {problem && <p role="alert" className="field-error">{problem}</p>}
    <button type="submit" disabled={busy}>{busy ? "Saving…" : current ? "Save changes" : "Save this month"}</button>
  </form>;
}
