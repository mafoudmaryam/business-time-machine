import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TodayOut } from "../../api";
import { formatMoney } from "../../lib/format";
import { chartRows, type ChartKind } from "../../lib/todayView";

const TABS: { kind: ChartKind; label: string; help: string }[] = [
  { kind: "profit", label: "What you keep", help: "What is left each month after paying for everything." },
  { kind: "cash", label: "Cash in the bank", help: "The money in your bank at the end of each month." },
];

/** The next 12 months if you change nothing: the most likely path (line) and the bad-case to good-case range (shaded). */
export function TodayChart({ today }: { today: TodayOut }) {
  const [kind, setKind] = useState<ChartKind>("profit");
  const rows = chartRows(today, kind);
  const money = (v: number) => formatMoney(v, today.currency);
  const tab = TABS.find((t) => t.kind === kind)!;
  const first = rows[0];
  const last = rows[rows.length - 1];

  return (
    <section className="today-chart" aria-labelledby="today-chart-title">
      <h2 id="today-chart-title">The next 12 months, if you change nothing</h2>
      <div className="chip-row" role="group" aria-label="What to show">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            className="chip-button"
            aria-pressed={t.kind === kind}
            onClick={() => setKind(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="field-help">
        {tab.help} The line is the most likely path; the shaded area runs from a bad case to a good case.
      </p>
      <div
        role="img"
        aria-label={`${tab.label}, month by month. Most likely ${money(first.p50)} in ${first.label} and ${money(last.p50)} in ${last.label}. Bad case ${money(last.p10)}, good case ${money(last.p90)} by ${last.label}.`}
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} />
            <YAxis tickFormatter={money} width={84} />
            <Tooltip
              formatter={(value, name) => {
                if (Array.isArray(value)) {
                  const [lo, hi] = value as [number, number];
                  return [`${money(lo)} to ${money(hi)}`, "Bad case to good case"];
                }
                return [money(Number(value)), String(name)];
              }}
            />
            <Area type="monotone" dataKey="range" name="Range" stroke="none" fill="#6b4331" fillOpacity={0.15} isAnimationActive={false} />
            <Line type="monotone" dataKey="p50" name="Most likely" stroke="#6b4331" strokeWidth={2} dot={false} isAnimationActive={false} />
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
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{money(r.p10)}</td>
                <td>{money(r.p50)}</td>
                <td>{money(r.p90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
