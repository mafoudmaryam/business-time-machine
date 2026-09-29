import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Fragment } from "react";
import type { SimulationRunOut } from "../api";
import { PATH_COLORS, pathName } from "../lib/paths";
import { formatMoney } from "../lib/format";
import { chanceOutOf10, signed } from "../lib/formatChance";
import { riskAlert } from "../lib/riskAlert";
import { NumbersTable } from "./NumbersTable";


function compactMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 0 }).format(value);
  } catch {
    return formatMoney(value, currency);
  }
}

/** The one-sentence answer at the top of a result. Only words engine numbers. */
function headline(run: SimulationRunOut, currency: string): string {
  const choices = run.results.slice(1);
  if (choices.length !== 1) return `Here's how your ideas compare over the next ${run.horizon} months.`;
  const diff = choices[0].summary.profit_vs_baseline_p50;
  if (diff === undefined) return `Here's what I see over the next ${run.horizon} months.`;
  const money = formatMoney(Math.abs(diff), currency);
  if (Math.round(diff) === 0) return `Over the next ${run.horizon} months, this most likely makes no real difference to your profit.`;
  return diff > 0
    ? `Over the next ${run.horizon} months, this most likely brings you about ${money} more profit than keeping things as they are.`
    : `Over the next ${run.horizon} months, this most likely costs you about ${money} in profit compared with keeping things as they are.`;
}

/** The result, as the advisor's reply: one sentence, the paths side by side, and one picture
 * (money in the bank, month by month). Every number is read straight from the engine. */
export function ResultBubble({ run, currency, customerNoun }: { run: SimulationRunOut; currency: string; customerNoun: string }) {
  const horizon = run.results[0]?.bands.cash?.p50.length ?? 0;
  const data = Array.from({ length: horizon }, (_, i) => {
    const row: Record<string, number | [number, number]> = { month: i + 1 };
    run.results.forEach((r, k) => {
      const b = r.bands.cash;
      if (!b) return;
      row[`p${k}`] = b.p50[i];
      if (k > 0) row[`band${k}`] = [b.p10[i], b.p90[i]];
    });
    return row;
  });
  const alerts = run.results
    .map((r) => ({ name: pathName(r), text: riskAlert(r.summary) }))
    .filter((a) => a.text !== null);

  return (
    <div className="result">
      <p className="result-headline">{headline(run, currency)}</p>

      <ul className="paths" aria-label="Total profit on each path">
        {run.results.map((r, k) => {
          const s = r.summary;
          const diff = s.profit_vs_baseline_p50;
          return (
            <li key={r.scenario_name} className={k === 0 ? "path path-keep" : "path"} style={{ borderColor: PATH_COLORS[k % PATH_COLORS.length] }}>
              <span className="path-name">{pathName(r)}</span>
              <span className="path-profit">
                {formatMoney(s.total_profit_p50, currency)}
                <span className="path-profit-label"> profit</span>
              </span>
              {k > 0 && diff !== undefined && (
                <span className={diff >= 0 ? "path-diff up" : "path-diff down"}>
                  {signed(diff, (v) => formatMoney(v, currency))}
                </span>
              )}
              {k > 0 && s.prob_beats_baseline_profit !== undefined && (
                <span className="path-odds">Comes out ahead in {chanceOutOf10(s.prob_beats_baseline_profit)}</span>
              )}
            </li>
          );
        })}
      </ul>

      {alerts.map((a) => (
        <p key={a.name} className="result-warning" role="alert">
          <strong>{a.name}:</strong> {a.text}
        </p>
      ))}

      <figure className="cash-chart">
        <figcaption>Money in the bank, month by month</figcaption>
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={{ stroke: "#d9c8b6" }}
              tick={{ fill: "#6a5444", fontSize: 12 }}
              ticks={[1, Math.round(horizon / 2), horizon]}
              tickFormatter={(m: number) => (m === 1 ? "Now" : `Month ${m}`)}
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#6a5444", fontSize: 12 }}
              tickFormatter={(v: number) => compactMoney(v, currency)}
            />
            <Tooltip
              contentStyle={{ background: "#fffdfa", border: "1px solid #e6d8c9", borderRadius: 10, fontSize: 13 }}
              labelFormatter={(m) => `Month ${m}`}
              formatter={(value, name) => {
                const k = Number(String(name).replace(/\D/g, ""));
                const label = pathName(run.results[k]);
                if (Array.isArray(value)) return [`${formatMoney(value[0], currency)} – ${formatMoney(value[1], currency)}`, `${label} (bad to good case)`];
                return [formatMoney(Number(value), currency), label];
              }}
            />
            {run.results.map((r, k) => (
              <Fragment key={r.scenario_name}>
                {k > 0 && (
                  <Area dataKey={`band${k}`} name={`band${k}`} stroke="none" fill={PATH_COLORS[k]} fillOpacity={0.12} isAnimationActive={false} />
                )}
                <Line
                  dataKey={`p${k}`}
                  name={`p${k}`}
                  stroke={PATH_COLORS[k % PATH_COLORS.length]}
                  strokeWidth={k === 0 ? 2 : 3}
                  strokeDasharray={k === 0 ? "6 5" : undefined}
                  dot={false}
                  type="monotone"
                  isAnimationActive={false}
                />
              </Fragment>
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="chart-note">
          Lines show the most likely path; the shading shows where 8 of 10 possible futures land. The dashed line is keeping things as they are.
        </p>
      </figure>

      <details className="all-numbers">
        <summary>See all the numbers</summary>
        <div className="table-scroll">
          <NumbersTable results={run.results} currency={currency} customerNoun={customerNoun} />
        </div>
        <p className="run-meta">
          Run #{run.id} · engine {run.engine_version} · seed {run.seed} · {run.iterations.toLocaleString()} possible futures
        </p>
      </details>
    </div>
  );
}
