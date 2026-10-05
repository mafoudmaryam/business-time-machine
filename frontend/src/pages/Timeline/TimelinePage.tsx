import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getBusiness } from "../../api";
import { useAsync } from "../../hooks/useAsync";
import { useSketch } from "../../hooks/useSketch";
import { track } from "../../lib/events";
import { DEFAULT_CURRENCY, formatCount, formatMoney } from "../../lib/format";
import { getRememberedBusinessId } from "../../lib/session";
import { lowestCashSentence, monthCard, monthValueText, parseTimelineQuery, timelineRows, type TimelineMetric } from "../../lib/sketch";

const TABS: { metric: TimelineMetric; label: string }[] = [
  { metric: "profit", label: "What you keep" },
  { metric: "cash", label: "Cash in the bank" },
  { metric: "customers", label: "Regular customers" },
];

export function TimelinePage() {
  const businessId = getRememberedBusinessId();
  const [params] = useSearchParams();
  const query = useMemo(() => parseTimelineQuery(params), [params]);
  const business = useAsync(() => (businessId ? getBusiness(businessId) : Promise.reject(new Error("none"))), [businessId]);
  const { sketch, failed } = useSketch(businessId, { type: query.type, amount: query.amount, start_month: query.start });
  const [month, setMonth] = useState(1);
  const [compare, setCompare] = useState(true);
  const [metric, setMetric] = useState<TimelineMetric>("profit");

  useEffect(() => {
    track("screen_view", "timeline");
  }, []);

  if (!businessId) return <Navigate to="/" replace />;

  const currency = business.data?.currency ?? DEFAULT_CURRENCY;
  const money = (v: number) => formatMoney(v, currency);
  const horizon = sketch?.horizon ?? 12;
  const card = sketch ? monthCard(sketch, month) : null;
  const label = sketch?.month_labels[month - 1] ?? "";
  const rows = sketch ? timelineRows(sketch, metric) : [];
  const fmt = (v: number) => (metric === "customers" ? formatCount(v) : money(v));
  const tab = TABS.find((t) => t.metric === metric)!;

  return (
    <div className="page timeline-page">
      <h1>The next 12 months</h1>
      <p className="sketch-pill">Just a sketch</p>
      {sketch && <p className="try-lead">{sketch.sentence}. A quick estimate from your own numbers. Nothing is saved.</p>}
      {!sketch && !failed && <p className="try-working">Working it out…</p>}
      {!sketch && failed && (
        <p className="try-failed" role="alert">
          We couldn't work that out just now. <Link to="/try">Go back to Try a change</Link> and try again.
        </p>
      )}

      {sketch && card && (
        <>
          <section className="try-card timeline-controls" aria-label="Pick a month">
            <div className="timeline-month-row">
              <label htmlFor="timeline-month" className="try-eyebrow">Pick a month</label>
              <p className="timeline-month-name" aria-hidden="true">{label}</p>
            </div>
            <input
              id="timeline-month" type="range" className="try-slider" min={1} max={horizon} step={1} value={month}
              aria-valuetext={monthValueText(month, label)} onChange={(e) => setMonth(Number(e.target.value))}
            />
            <div className="try-slider-labels" aria-hidden="true">
              <span>{sketch.month_labels[0]}</span>
              <span>{sketch.month_labels[horizon - 1]}</span>
            </div>
            <label className="timeline-compare">
              <input type="checkbox" role="switch" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
              <span>Compare with “if you change nothing”</span>
            </label>
          </section>

          <section className="try-card" aria-labelledby="timeline-chart-title">
            <h2 id="timeline-chart-title" className="visually-hidden">The next 12 months, month by month</h2>
            <div className="chip-row" role="group" aria-label="What to show">
              {TABS.map((t) => (
                <button key={t.metric} type="button" className="chip-button" aria-pressed={metric === t.metric} onClick={() => setMetric(t.metric)}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="field-help">
              The line is the most likely path; the shaded area runs from a bad case to a good case
              {compare ? "; the thin dashed line is what happens if you change nothing" : ""}.
            </p>
            <div
              role="img"
              aria-label={`${tab.label}, month by month. In ${label}: most likely ${fmt(rows[month - 1].p50)}${compare ? `, or ${fmt(rows[month - 1].baseline)} if you change nothing` : ""}.`}
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tickFormatter={fmt} width={84} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (Array.isArray(value)) return [`${fmt(value[0] as number)} to ${fmt(value[1] as number)}`, "Bad case to good case"];
                      return [fmt(Number(value)), String(name)];
                    }}
                  />
                  <Area type="monotone" dataKey="range" name="Range" stroke="none" fill="#6b4331" fillOpacity={0.15} isAnimationActive={false} />
                  {compare && (
                    <Line type="monotone" dataKey="baseline" name="If you change nothing" stroke="#6f5a4a" strokeWidth={1} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  )}
                  <Line type="monotone" dataKey="p50" name="With the change" stroke="#6b4331" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <ReferenceLine x={label} stroke="#2b1d16" strokeDasharray="2 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <details className="chart-numbers">
              <summary>Show the numbers</summary>
              <table>
                <caption className="visually-hidden">{tab.label}, month by month</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Bad case</th>
                    <th scope="col">Most likely</th>
                    <th scope="col">Good case</th>
                    {compare && <th scope="col">If you change nothing</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td>{fmt(r.range[0])}</td>
                      <td>{fmt(r.p50)}</td>
                      <td>{fmt(r.range[1])}</td>
                      {compare && <td>{fmt(r.baseline)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <p className="timeline-lowest">{lowestCashSentence(sketch.change, sketch.month_labels, sketch.cash_now, currency)}</p>

          <div className="today-tiles" role="group" aria-label={`${label}: the most likely numbers`}>
            <div className="today-tile">
              <h3>What you keep in {label}</h3>
              <p className="today-tile-number">{money(card.profit)}</p>
              {compare && <p>{money(card.profitBaseline)} if you change nothing.</p>}
            </div>
            <div className="today-tile">
              <h3>Cash in the bank, end of {label}</h3>
              <p className="today-tile-number">{money(card.cash)}</p>
              {compare && <p>{money(card.cashBaseline)} if you change nothing.</p>}
            </div>
            <div className="today-tile">
              <h3>Regular customers in {label}</h3>
              <p className="today-tile-number">{formatCount(card.customers)}</p>
              {compare && <p>{formatCount(card.customersBaseline)} if you change nothing.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
