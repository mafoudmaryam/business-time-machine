import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getJournal, type JournalMonthOut, type JournalOut } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { useDeleteFlow } from "../../components/useDeleteFlow";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { journalCsv, journalSummary, METRIC_WORDS, monthOptions, POSITION_WORDS } from "../../lib/journalView";
import { getRememberedBusinessId } from "../../lib/session";
import { JournalChart } from "./JournalChart";
import { JournalForm } from "./JournalForm";
import { RangeBar } from "./RangeBar";

function EntryCard({ month, onEdit, onDelete }: { month: JournalMonthOut; onEdit: () => void; onDelete: () => void }) {
  const { entry } = month;
  return (
    <li className="journal-entry">
      <div className="journal-entry-head">
        <h3>{entry.month_label}</h3>
        <div className="journal-entry-actions">
          <button type="button" className="secondary" onClick={onEdit} aria-label={`Edit ${entry.month_label}`}>
            Edit
          </button>
          <button type="button" className="secondary" onClick={onDelete} aria-label={`Delete ${entry.month_label}`}>
            Delete
          </button>
        </div>
      </div>
      {month.has_prediction ? (
        <ul className="journal-compare">
          {month.comparisons.map((c) => (
            <li key={c.metric}>
              <p className="journal-metric">
                {METRIC_WORDS[c.metric].title}: <span className={`journal-where journal-where-${c.position}`}>{POSITION_WORDS[c.position]}</span>
              </p>
              <RangeBar comparison={c} label={METRIC_WORDS[c.metric].title} />
              <p className="journal-sentence">{c.sentence}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="journal-sentence">{month.summary}</p>
      )}
      {entry.note && <p className="journal-note">Your note: {entry.note}</p>}
    </li>
  );
}

/** Saves the journal as a CSV file from what is already on screen. Nothing is sent anywhere. */
function downloadCsv(entries: JournalMonthOut[]) {
  const url = URL.createObjectURL(new Blob([journalCsv(entries)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-journal.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Loaded({ journal, reload }: { journal: JournalOut; reload: () => void }) {
  const [params, setParams] = useSearchParams();
  const [requested, setRequested] = useState<string | null>(params.get("month"));
  const [saved, setSaved] = useState<string | null>(null);
  const { ask, dialog } = useDeleteFlow();
  // Last month is already asked by the card at the top; this lists any older month still waiting.
  const lastMonth = monthOptions(new Date(), 2)[1].value;
  const olderDue = journal.due.filter((d) => d.month !== lastMonth);

  useEffect(() => {
    track("screen_view", "journal", { sample: journal.is_sample });
  }, [journal.is_sample]);

  // The address' ?month=... only matters for the first visit; drop it so Back does not replay it.
  useEffect(() => {
    if (params.has("month")) {
      const next = new URLSearchParams(params);
      next.delete("month");
      setParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page journal-page">
      <h1>
        My journal<span className="sample-tag">Pilot feature</span>
      </h1>
      <p className="try-lead">
        Write down what really happened each month. We put it next to what we expected, so you can see how close we were. This is a
        pilot: a few months of figures can't prove the forecasts right or wrong, but they show whether they are useful.
      </p>
      {journal.is_sample && <p className="currency-notice" role="note">This is a sample business, so anything you write here is just practice.</p>}

      {olderDue.length > 0 && (
        <section className="journal-due" aria-label="Months waiting for your figures">
          {olderDue.map((d) => (
            <p key={d.month}>
              <strong>How did {d.month_label.split(" ")[0]} really go?</strong>{" "}
              <button
                type="button"
                className="linklike"
                onClick={() => {
                  track("journal_prompt_clicked", "journal");
                  setRequested(d.month);
                }}
              >
                Write it down
              </button>
            </p>
          ))}
        </section>
      )}

      <JournalForm
        businessId={journal.business_id}
        currency={journal.currency}
        existing={journal.entries}
        due={journal.due}
        requestedMonth={requested}
        onSaved={(result, edited) => {
          setSaved(`${edited ? "Updated" : "Saved"} ${result.entry.month_label}.`);
          setRequested(null);
          reload();
        }}
      />
      <p className="journal-saved" role="status">
        {saved}
      </p>

      {journal.forecast && (
        <section className="journal-chart-section" aria-labelledby="journal-chart-title">
          <h2 id="journal-chart-title">Our forecast, and what really happened</h2>
          <JournalChart months={journal.forecast.months} entries={journal.entries} currency={journal.currency} />
        </section>
      )}

      <section className="journal-entries" aria-labelledby="journal-entries-title">
        <h2 id="journal-entries-title">What you wrote down</h2>
        {journal.entries.length > 0 && <p className="journal-summary">{journalSummary(journal.entries)}</p>}
        {journal.entries.length === 0 ? (
          <EmptyState
            compact
            title="Nothing written down yet"
            action={{ label: "Write down a month", onClick: () => document.getElementById("journal-month")?.focus() }}
          >
            <p>After a month ends, come back and enter three figures. We'll show how they compare with what we expected.</p>
          </EmptyState>
        ) : (
          <ul className="journal-list">
            {journal.entries.map((m) => (
              <EntryCard
                key={m.entry.id}
                month={m}
                onEdit={() => {
                  track("journal_edit_clicked", "journal");
                  setRequested(m.entry.month);
                }}
                onDelete={() =>
                  ask({
                    kind: "journal",
                    id: m.entry.id,
                    businessId: journal.business_id,
                    month: m.entry.month,
                    name: m.entry.month_label,
                    onDone: reload,
                    onUndone: reload,
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {journal.entries.length > 0 && (
        <p className="no-print">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              track("journal_csv_downloaded", "journal", { months: journal.entries.length });
              downloadCsv(journal.entries);
            }}
          >
            Download my journal (CSV)
          </button>
        </p>
      )}

      <p className="disclaimer">
        The expected range runs from a bad case to a good case, with a most likely figure in between. Scenarios, not forecasts. Not
        financial advice.
      </p>
      <p className="how-links">
        <Link to="/today">Back to Today</Link>
      </p>
      {dialog}
    </div>
  );
}

export function JournalPage() {
  const id = getRememberedBusinessId();
  const journal = useAsync(() => (id ? getJournal(id) : Promise.reject(new Error("no business"))), [id]);

  if (!id) return <Navigate to="/" replace />;
  if (journal.loading && !journal.data) {
    return (
      <div className="page">
        <Spinner label="Opening your journal…" />
      </div>
    );
  }
  if (journal.error || !journal.data) {
    return (
      <div className="page">
        <LoadError
          message={journal.error}
          what="your journal"
          onRetry={journal.reload}
          extra={
            <Link className="empty-action empty-action-quiet" to="/">
              Go to the start screen
            </Link>
          }
        />
      </div>
    );
  }
  return <Loaded journal={journal.data} reload={journal.reload} />;
}
