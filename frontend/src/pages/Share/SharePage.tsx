import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getHow, getSimulationRun, getSummary, listSimulationRuns, type HowOut, type SimulationRunOut, type TodayOut } from "../../api";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { formatMoney } from "../../lib/format";
import { DISCLAIMER, formatHowValue } from "../../lib/how";
import { getRememberedBusinessId } from "../../lib/session";
import { compareRows, initialChoice, parseChoice, scenarioChoices, type PlanRow } from "../../lib/share";
import { displayScenarioName } from "../../lib/scenarioLabel";
import { industryWord, lowestCashTile, profitTile, safetyTile } from "../../lib/todayView";
import { SharePlanChart } from "./SharePlanChart";

function describeChart(title: string, rows: PlanRow[], fmt: (v: number) => string): string {
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `${title}, month by month. Most likely ${fmt(first.p50)} in ${first.label} and ${fmt(last.p50)} in ${last.label}. By ${last.label}: bad case ${fmt(last.p10)}, good case ${fmt(last.p90)}.`;
}

function rowsFrom(today: TodayOut, metric: "profit" | "cash"): PlanRow[] {
  return today.month_labels.map((label, i) => ({
    label, p10: today[metric].p10[i], p50: today[metric].p50[i], p90: today[metric].p90[i],
  }));
}

function ComparisonSection({ run, scenario, currency }: { run: SimulationRunOut; scenario: string; currency: string }) {
  const change = run.results.find((r) => r.scenario_name === scenario);
  const nothing = run.results.find((r) => r.scenario_name === "baseline");
  if (!change || !nothing) return null;
  const money = (v: number) => formatMoney(v, currency);
  const rows: PlanRow[] = change.bands.profit.p50.map((p50, i) => ({
    label: `Month ${i + 1}`, p10: change.bands.profit.p10[i], p50, p90: change.bands.profit.p90[i], baseline: nothing.bands.profit.p50[i],
  }));
  return (
    <section className="share-section" aria-labelledby="share-compare">
      <h2 id="share-compare">With “{displayScenarioName(scenario)}” and without it</h2>
      <table className="share-table">
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Measure</span></th>
            <th scope="col">With the change</th>
            <th scope="col">If you change nothing</th>
          </tr>
        </thead>
        <tbody>
          {compareRows(change, nothing, run.horizon, currency).map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.withChange}</td>
              <td>{r.without}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figure className="share-figure">
        <SharePlanChart rows={rows} format={money} label={describeChart("What you keep each month, with the change", rows, money)} />
        <figcaption>
          What you keep each month, over {run.horizon} months. Solid line: most likely with the change. Shaded: bad case to good case. Thin dashed line:
          if you change nothing.
        </figcaption>
      </figure>
    </section>
  );
}

function Sheet({ today, how }: { today: TodayOut; how: HowOut }) {
  const [params] = useSearchParams();
  const businessId = today.business_id;
  const runs = useAsync(() => listSimulationRuns(businessId), [businessId]);
  const choices = scenarioChoices(runs.data ?? []);
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ?? initialChoice(params, choices);
  const parsed = chosen ? parseChoice(chosen) : null;
  const run = useAsync(() => (parsed ? getSimulationRun(parsed.runId) : Promise.resolve(null)), [parsed?.runId]);

  useEffect(() => {
    track("screen_view", "share", { sample: today.is_sample });
  }, [today.is_sample]);

  const money = (v: number) => formatMoney(v, today.currency);
  const profit = rowsFrom(today, "profit");
  const cash = rowsFrom(today, "cash");
  const tiles = [profitTile(today.tiles, today.currency), safetyTile(today.tiles, today.currency), lowestCashTile(today.tiles, today.currency)];
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const noun = industryWord(today.industry);

  return (
    <div className="page share-page">
      <div className="share-controls no-print">
        <button
          type="button"
          onClick={() => {
            track("print_clicked", "share");
            window.print();
          }}
        >
          Print or save as PDF
        </button>
        <p className="field-help">This opens your browser's print window. Choose “Save as PDF” there to keep a copy. Nothing is sent anywhere.</p>
        {choices.length > 0 ? (
          <div className="field">
            <label htmlFor="share-scenario">Add a saved scenario to compare (optional)</label>
            <select id="share-scenario" value={chosen} onChange={(e) => setPicked(e.target.value)}>
              <option value="">None: just show where things stand today</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="field-help">
            Want to compare a change? <Link to="/try">Try a change</Link> and save it as a scenario, then come back here.
          </p>
        )}
        {run.loading && parsed && <p className="try-status" role="status">Loading that scenario…</p>}
        {run.error && <p className="try-failed" role="alert">We couldn't load that scenario just now. The summary below is without it.</p>}
      </div>

      <article className="share-sheet" aria-labelledby="share-title">
        <header className="share-header">
          <h1 id="share-title">{today.name}: plan summary</h1>
          <p>Prepared on {date}</p>
          {today.is_sample && <p className="share-sample">This is a sample {noun}: the numbers are examples, not a real business.</p>}
        </header>

        <section className="share-section" aria-labelledby="share-today">
          <h2 id="share-today">Where the business stands today</h2>
          <div className="share-facts">
            {tiles.map((t) => (
              <div key={t.title} className="share-fact">
                <h3>{t.title}</h3>
                <p className="share-number">{t.headline}</p>
                <p>{t.detail}</p>
                {t.risk && <p className="share-risk">{t.risk}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="share-section" aria-labelledby="share-next">
          <h2 id="share-next">The next 12 months, if you change nothing</h2>
          <figure className="share-figure">
            <SharePlanChart rows={profit} format={money} label={describeChart("What you keep each month", profit, money)} />
            <figcaption>What you keep each month. Solid line: most likely. Shaded: bad case to good case.</figcaption>
          </figure>
          <figure className="share-figure">
            <SharePlanChart rows={cash} format={money} label={describeChart("Cash in the bank", cash, money)} />
            <figcaption>Cash in the bank at the end of each month. Solid line: most likely. Shaded: bad case to good case.</figcaption>
          </figure>
        </section>

        {run.data && parsed && <ComparisonSection run={run.data} scenario={parsed.scenario} currency={today.currency} />}

        <section className="share-section" aria-labelledby="share-built">
          <h2 id="share-built">What this is built on</h2>
          {how.told.length > 0 && (
            <>
              <h3>Numbers the owner gave</h3>
              <ul className="share-list">
                {how.told.map((t) => (
                  <li key={t.key}>
                    {t.label}: <strong>{formatHowValue(t, today.currency)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
          {how.assumed.length > 0 && (
            <>
              <h3>Numbers we assumed</h3>
              <ul className="share-list">
                {how.assumed.filter((a) => a.important).map((a) => (
                  <li key={a.field}>
                    {a.label}: <strong>{formatHowValue(a, today.currency)}</strong>, {a.rule}
                  </li>
                ))}
                <li>Everything else (pay per person, ingredient costs, how often regulars come back and similar) is typical for a small {noun}.</li>
              </ul>
            </>
          )}
          <p className="share-small">
            Worked out from {how.run.iterations.toLocaleString()} possible futures, month by month (program version {how.run.engine_version}).
          </p>
        </section>

        <footer className="share-footer">
          <p className="share-disclaimer">{DISCLAIMER}</p>
          <p className="share-small">Made with Business Time Machine. Nothing in this summary has been sent anywhere.</p>
        </footer>
      </article>
    </div>
  );
}

export function SharePage() {
  const id = getRememberedBusinessId();
  const summary = useAsync(() => (id ? getSummary(id) : Promise.reject(new Error("no business"))), [id]);
  const how = useAsync(() => (id ? getHow(id) : Promise.reject(new Error("no business"))), [id]);

  if (!id) return <Navigate to="/" replace />;
  const failure = summary.error ?? how.error;
  if (failure) {
    return (
      <div className="page">
        <LoadError message={failure} what="your summary" onRetry={() => { summary.reload(); how.reload(); }} extra={<Link className="empty-action empty-action-quiet" to="/">Go to the start screen</Link>} />
      </div>
    );
  }
  if (!summary.data || !how.data) {
    return (
      <div className="page">
        <Spinner label="Preparing your summary…" />
      </div>
    );
  }
  return <Sheet today={summary.data} how={how.data} />;
}
