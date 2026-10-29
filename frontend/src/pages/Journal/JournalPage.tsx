import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getJournal, type JournalMonthOut, type JournalOut, type JournalMetric } from "../../api";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { useDeleteFlow } from "../../components/useDeleteFlow";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { journalCsv, METRIC_WORDS, monthLabel } from "../../lib/journalView";
import { getRememberedBusinessId } from "../../lib/session";
import { JournalChart } from "./JournalChart";
import { JournalForm } from "./JournalForm";
import { RangeBar } from "./RangeBar";

function journalMoney(value: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 6 }).format(value); }
  catch { return `${currency} ${value.toLocaleString()}`; }
}

export function EntryCard({ month, currency, onEdit, onDelete }: { month: JournalMonthOut; currency: string; onEdit: () => void; onDelete: () => void }) {
  const { entry, comparison_plan: plan } = month;
  const money = (value: number | null | undefined) => value == null ? "Not recorded" : journalMoney(value, month.currency ?? currency);
  const breakdown = entry.actual_sales != null || entry.actual_costs != null;
  const metrics: JournalMetric[] = ["revenue", "profit", ...(entry.actual_cash != null ? ["cash" as const] : []), ...(entry.actual_visits != null ? ["visits" as const] : [])];
  return <li className="journal-entry">
    <div className="journal-entry-head"><h3>{entry.month_label}</h3><div className="journal-entry-actions">
      <button type="button" className="secondary" onClick={onEdit} aria-label={`Edit ${entry.month_label}`}>Edit</button>
      <button type="button" className="secondary" onClick={onDelete} aria-label={`Delete ${entry.month_label}`}>Delete</button>
    </div></div>
    <h4>Where the sales money went</h4>
    <dl className="journal-money-flow">
      <div><dt>Sales money earned</dt><dd>{money(entry.actual_sales)}</dd></div>
      <div><dt>Costs incurred{breakdown && !entry.costs_complete ? " (so far)" : ""}</dt><dd>{money(entry.actual_costs)}</dd></div>
      <div><dt>{breakdown ? entry.costs_complete ? "Profit or loss" : "Balance before unrecorded costs" : "Reported profit or loss"}</dt><dd>{money(breakdown && !entry.costs_complete ? entry.recorded_remaining : entry.actual_profit)}</dd></div>
    </dl>
    {breakdown && !entry.costs_complete && <p className="field-help">These costs may be incomplete. The balance is not profit. Enter both sales and costs and check that all costs are included to calculate profit or loss.</p>}
    {!breakdown && <p className="field-help">This record contains an owner-reported profit or loss. Sales and cost details were not recorded, so we cannot check what was included.</p>}
    <div className="journal-table-wrap"><table className="journal-result-table"><caption>Expected, actual and difference for {entry.month_label}</caption>
      <thead><tr><th scope="col">Figure</th><th scope="col">Expected</th><th scope="col">Actual</th><th scope="col">Difference</th></tr></thead>
      <tbody>{metrics.map(metric => {
        const c = month.comparisons.find(c => c.metric === metric);
        const band = plan?.bands?.[metric];
        const value = metric === "revenue" ? entry.actual_sales : metric === "profit" ? entry.actual_profit : metric === "cash" ? entry.actual_cash : entry.actual_visits;
        const display = (v: number | null | undefined) => v == null ? "Not recorded" : metric === "visits" ? v.toLocaleString() : money(v);
        return <tr key={metric}><th scope="row">{metric === "cash" ? "Month-end cash balance" : METRIC_WORDS[metric].title}</th><td data-label="Expected">{c ? display(c.expected) : band ? display(band.p50) : "No saved estimate"}</td><td data-label="Actual">{display(value)}</td><td data-label="Difference">{c ? display(c.difference) : "Not compared"}</td></tr>;
      })}<tr><th scope="row">Costs incurred</th><td data-label="Expected">No separate cost estimate</td><td data-label="Actual">{money(entry.actual_costs)}</td><td data-label="Difference">Not compared</td></tr></tbody>
    </table></div>
    <p className="journal-sentence">{month.summary}</p>
    <p className="field-help">A difference tells us what changed, not why. One month cannot prove a cause. A positive difference means a higher amount, not necessarily a better outcome.</p>
    <p><Link to="/today#assumed">Review current assumptions</Link><span className="field-help"> — check prices, sales volume and costs against what you observed. Nothing is changed automatically.</span></p>
    <details className="page-details"><summary>Comparison plan and recording details</summary>
      {plan?.available ? <><p>{plan.name}. Estimate made {plan.made_at?.slice(0, 10)} for {entry.month_label}; run {plan.run_id}. These monthly figures are frozen with this record.</p>
        {plan.source === "legacy_upgrade" && <p>For this older record, the eligible plan available at upgrade was preserved. The originally viewed plan was not stored, so we cannot verify it was the same one.</p>}
        <p>Expected figures are the middle of simulated monthly ranges, not guarantees or real-world success probabilities. The model’s profit covers its modeled operating costs. Tax, finance charges or other accounting adjustments may be outside it; check that the costs being compared match. Historical input assumptions were not stored with this plan. The assumptions link shows the current model, which may differ.</p>
      </> : <p>No eligible plan was available before this month began. This record will not acquire a later estimate retroactively.</p>}
      {month.comparisons.map(c => <div key={c.metric}><RangeBar comparison={c} label={METRIC_WORDS[c.metric].title} /><p>{c.sentence}</p></div>)}
      <p>Cash balance is a month-end stock. Cash received and paid during the month are not recorded, so cash flow cannot be calculated. Profit, sales and cash are different.</p>
      <p>{entry.updated_at ? `Last saved or corrected ${entry.updated_at.slice(0, 10)}. The comparison plan was retained.` : "Original record retained."} Correcting this month replaces its entered figures in the same record; earlier corrections are not kept as separate versions.</p>
      {entry.note && <p className="journal-note">Your note: {entry.note}</p>}
    </details>
  </li>;
}
function downloadCsv(entries: JournalMonthOut[]) {
  const url = URL.createObjectURL(new Blob([journalCsv(entries)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "my-journal.csv";
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function Loaded({ journal, reload }: { journal: JournalOut; reload: () => void }) {
  const [params, setParams] = useSearchParams();
  const [requested, setRequested] = useState<string | null>(params.get("month"));
  const [saved, setSaved] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(params.get("month"));
  const { ask, dialog } = useDeleteFlow();
  const current = selected !== null ? journal.entries.find(m => m.entry.month === selected) : journal.entries[0];
  const chartSafe = journal.entries.every(m => !m.currency || m.currency === journal.currency);
  const older = journal.entries.filter(m => m.entry.id !== current?.entry.id);
  useEffect(() => { track("screen_view", "journal", { sample: journal.is_sample }); }, [journal.is_sample]);
  useEffect(() => { if (params.has("month")) { const next = new URLSearchParams(params); next.delete("month"); setParams(next, { replace: true }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function card(m: JournalMonthOut) { return <EntryCard key={m.entry.id} month={m} currency={journal.currency} onEdit={() => { track("journal_edit_clicked", "journal"); setRequested(m.entry.month); setSelected(m.entry.month); }} onDelete={() => ask({ kind: "journal", id: m.entry.id, businessId: journal.business_id, month: m.entry.month, name: m.entry.month_label, onDone: reload, onUndone: reload })} />; }
  return <div className="page journal-page">
    <p className="page-eyebrow">Track results</p><h1>How did this month go?</h1>
    <p className="try-lead">Record sales and costs for one month. Compare what happened with the plan saved for that month.</p>
    {journal.is_sample && <p className="currency-notice" role="note">This is a sample business, so anything you write here is just practice.</p>}
    <JournalForm businessId={journal.business_id} currency={journal.currency} existing={journal.entries} due={journal.due} requestedMonth={requested} onMonthSelected={setSelected} onSaved={(result, edited) => { setSaved(`${edited ? "Updated" : "Saved"} ${result.entry.month_label}.`); setRequested(null); setSelected(result.entry.month); reload(); }} />
    <p role="status" className="journal-saved">{saved}</p>
    <section aria-labelledby="journal-summary-title"><h2 id="journal-summary-title">Your month at a glance</h2>
      {current ? <ul className="journal-list">{card(current)}</ul> : <p>{selected && journal.entries.length ? `No figures recorded for ${monthLabel(selected)}. Use the form above to record this month.` : "No months recorded yet. Use the form above to write down a month."}</p>}
    </section>
    <details className="page-details"><summary>History and missing months</summary>
      <p>Only recorded months appear. A missing figure or month means unknown, never zero. You can choose an older month in the form to add it or correct it.</p>
      {journal.due.length > 0 && <section className="journal-due" aria-label="Months waiting for your figures">{journal.due.map(d => <p key={d.month}>{d.month_label} has not been recorded. <button type="button" className="linklike" onClick={() => { track("journal_prompt_clicked", "journal"); setRequested(d.month); setSelected(d.month); }}>Record {d.month_label}</button></p>)}</section>}
      {older.length ? <ul className="journal-list">{older.map(card)}</ul> : <p>No other months recorded.</p>}
      {journal.forecast && chartSafe && <details className="page-details"><summary>Compare recorded profit with the estimate</summary><JournalChart months={journal.forecast.months} entries={journal.entries} currency={journal.currency} /><p>Missing or incomplete profit figures have no dot. Saved comparisons retain their original monthly estimate.</p></details>}
      {!chartSafe && <p>The optional chart is hidden because these records use different currencies. Each monthly comparison keeps its recorded currency; amounts are not converted.</p>}
      {journal.entries.length > 0 && <button type="button" className="secondary" onClick={() => { track("journal_csv_downloaded", "journal", { months: journal.entries.length }); downloadCsv(journal.entries); }}>Download my journal (CSV)</button>}
    </details>
    <p className="disclaimer">These records help you review assumptions. They do not establish why results changed or prove the model is right.</p>
    <p className="how-links"><Link to="/today">Back to Overview</Link></p>{dialog}
  </div>;
}
function BusinessJournal({ id }: { id: number }) {
  const journal = useAsync(() => getJournal(id), [id]);
  if (journal.loading && !journal.data) return <div className="page"><Spinner label="Opening your journal…" /></div>;
  if (journal.error || !journal.data) return <div className="page"><LoadError message={journal.error} what="your journal" onRetry={journal.reload} extra={<Link to="/">Go to the start screen</Link>} /></div>;
  return <Loaded journal={journal.data} reload={journal.reload} />;
}
export function JournalPage() {
  const id = getRememberedBusinessId();
  return id ? <BusinessJournal key={id} id={id} /> : <Navigate to="/" replace />;
}
