import { useEffect, useRef, useState } from "react";
import type { JournalDue, JournalEntryOut, JournalMonthOut } from "../../api";
import { saveJournalEntry } from "../../api";
import { InfoTip } from "../../components/InfoTip";
import { NumberField } from "../../components/NumberField";
import { formatUnit } from "../../lib/format";
import { celebrate } from "../../lib/celebrate";
import { track } from "../../lib/events";
import { METRIC_WORDS, monthOptions, parseAmount, startingMonth, toEntryIn, validateEntry, type EntryErrors } from "../../lib/journalView";

interface Props {
  businessId: number;
  currency: string;
  /** Months already written down, to prefill the form when one is picked again. */
  existing: JournalMonthOut[];
  due: JournalDue[];
  /** A month to jump to (from a "How did X really go?" prompt or the Edit button). */
  requestedMonth: string | null;
  onSaved: (saved: JournalMonthOut, edited: boolean) => void;
  now?: Date;
}

/** Writes down one month. These are the owner's own figures: no AI reads them, and there is nothing to confirm. */
export function JournalForm({ businessId, currency, existing, due, requestedMonth, onSaved, now }: Props) {
  const clock = now ?? new Date();
  const [month, setMonth] = useState(() => requestedMonth ?? startingMonth(due, clock));
  // A new request (a "Write it down" or "Edit" click) moves the form to that month. Done while drawing, not in an effect.
  const [seenRequest, setSeenRequest] = useState(requestedMonth);
  if (requestedMonth !== seenRequest) {
    setSeenRequest(requestedMonth);
    if (requestedMonth) setMonth(requestedMonth);
  }
  const current = existing.find((m) => m.entry.month === month)?.entry ?? null;
  // The boxes start from what is saved for the month. A different month, or a changed saved entry, starts them afresh.
  const key = current ? `${month}|${current.id}|${current.actual_profit}|${current.actual_cash}|${current.actual_visits}|${current.note ?? ""}` : `${month}|new`;
  return (
    <JournalFields
      key={key}
      businessId={businessId}
      currency={currency}
      month={month}
      onMonth={setMonth}
      current={current}
      onSaved={onSaved}
      scrollTo={requestedMonth}
      clock={clock}
    />
  );
}

interface FieldsProps {
  businessId: number;
  currency: string;
  month: string;
  onMonth: (month: string) => void;
  current: JournalEntryOut | null;
  onSaved: Props["onSaved"];
  scrollTo: string | null;
  clock: Date;
}

function JournalFields({ businessId, currency, month, onMonth, current, onSaved, scrollTo, clock }: FieldsProps) {
  const options = monthOptions(clock);
  const [profit, setProfit] = useState(current ? current.actual_profit : NaN);
  const [cash, setCash] = useState(current ? current.actual_cash : NaN);
  const [visits, setVisits] = useState(current ? current.actual_visits : NaN);
  const [note, setNote] = useState(current?.note ?? "");
  const [errors, setErrors] = useState<EntryErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (scrollTo) formRef.current?.scrollIntoView?.({ block: "start" });
  }, [scrollTo]);

  const money = formatUnit("{CUR}", currency);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = validateEntry({ month, profit, cash, visits, note });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setProblem(null);
    try {
      const saved = await saveJournalEntry(businessId, toEntryIn({ month, profit, cash, visits, note }));
      track("journal_saved", "journal", { edited: current !== null, compared: saved.has_prediction });
      celebrate(); // the owner just wrote a month down: we cheer that, never what the numbers say
      onSaved(saved, current !== null);
    } catch {
      setProblem("We couldn't save that just now. Nothing was lost. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="journal-form" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="journal-form-title">
      <h2 id="journal-form-title">{current ? "Change what you wrote" : month === monthOptions(clock, 2)[1].value ? "How did last month go?" : "Write down a month"}</h2>
      <div className="field">
        <label htmlFor="journal-month">Which month?</label>
        <select id="journal-month" value={month} onChange={(e) => onMonth(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {errors.month && <p className="field-error">{errors.month}</p>}
      </div>
      <NumberField
        label={METRIC_WORDS.profit.title}
        unit={money}
        help="What was left after all your costs. Use a minus sign for a loss. You can type 5,200 or $5200."
        tooltip={METRIC_WORDS.profit.help}
        parse={parseAmount}
        value={profit}
        onChange={setProfit}
        error={errors.profit}
      />
      <NumberField
        label={METRIC_WORDS.cash.title}
        unit={money}
        help="At the end of the last day of the month."
        tooltip={METRIC_WORDS.cash.help}
        parse={parseAmount}
        value={cash}
        onChange={setCash}
        error={errors.cash}
      />
      <NumberField
        label={METRIC_WORDS.visits.title}
        unit="visits"
        help="A rough count is fine."
        tooltip={METRIC_WORDS.visits.help}
        parse={parseAmount}
        value={visits}
        onChange={setVisits}
        error={errors.visits}
      />
      <div className="field">
        <label htmlFor="journal-note">
          A note for yourself <span className="field-unit">(optional)</span>
          <InfoTip text="Anything that explains the month, like a holiday, a road closed or a new menu. It is only for you." />
        </label>
        <textarea id="journal-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : current ? "Save changes" : "Save this month"}
      </button>
    </form>
  );
}
