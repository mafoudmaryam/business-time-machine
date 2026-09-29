import { Fragment } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScenarioResultOut } from "../../api";
import { InfoTip } from "../../components/InfoTip";
import { SCENARIO_COLORS } from "../../constants";
import { DEFAULT_CURRENCY, formatMoney } from "../../lib/format";
import { displayScenarioName } from "../../lib/scenarioLabel";

interface Props {
  title: string;
  tooltip?: string;
  metric: string; // key into ScenarioResultOut.bands, e.g. "revenue"
  results: ScenarioResultOut[]; // baseline first, so SCENARIO_COLORS[0] is always "if you change nothing"
  isMoney: boolean;
  currency?: string;
  /** The big featured chart is taller. */
  height?: number;
}

type ChartRow = { month: number } & Record<string, number | [number, number]>;

function formatValue(value: number, isMoney: boolean, currency: string): string {
  return isMoney ? formatMoney(value, currency) : Math.round(value).toLocaleString();
}

/** Short axis labels ("$60K" instead of "$60,000") so the numbers never crowd the chart. */
function formatAxis(value: number, isMoney: boolean, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
      ...(isMoney ? { style: "currency", currency } : {}),
    }).format(value);
  } catch {
    return formatValue(value, isMoney, currency);
  }
}

/** One band-plus-line chart, reused for revenue/profit/cash/customers. Each scenario
 * draws a shaded bad-case-to-good-case area and a most-likely line. "If you change
 * nothing" is dashed so it reads as the reference line even without color.
 * Scenario names live in one shared legend above the charts (ChartLegend) instead
 * of being repeated under every chart. */
export function MetricChart({ title, tooltip, metric, results, isMoney, currency = DEFAULT_CURRENCY, height = 240 }: Props) {
  const horizon = results[0]?.bands[metric]?.p50.length ?? 0;
  const data: ChartRow[] = Array.from({ length: horizon }, (_, i) => {
    const row: ChartRow = { month: i + 1 };
    for (const r of results) {
      const bands = r.bands[metric];
      if (!bands) continue;
      row[`${r.scenario_name}_p50`] = bands.p50[i];
      row[`${r.scenario_name}_band`] = [bands.p10[i], bands.p90[i]];
    }
    return row;
  });

  return (
    <figure className="metric-chart">
      <figcaption>
        <h3>
          {title} {tooltip && <InfoTip text={tooltip} />}
        </h3>
      </figcaption>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#e2d3c3" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: "#cbb8a5" }}
            tick={{ fill: "#6f5a4a", fontSize: 12 }}
            minTickGap={16}
            tickFormatter={(m: number) => `M${m}`}
          />
          <YAxis
            tickFormatter={(v: number) => formatAxis(v, isMoney, currency)}
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#6f5a4a", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ background: "#faf5ef", border: "1px solid #e2d3c3", borderRadius: 8, fontSize: 13 }}
            labelFormatter={(month) => `Month ${month}`}
            formatter={(value, name) => {
              const label = displayScenarioName(String(name));
              if (Array.isArray(value)) {
                const [lo, hi] = value as [number, number];
                return [`${formatValue(lo, isMoney, currency)} – ${formatValue(hi, isMoney, currency)}`, `${label} (bad to good case)`];
              }
              return [formatValue(Number(value), isMoney, currency), `${label} (most likely)`];
            }}
          />
          {results.map((r, i) => {
            const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
            const isBaseline = i === 0;
            return (
              <Fragment key={r.scenario_name}>
                <Area
                  type="monotone"
                  dataKey={`${r.scenario_name}_band`}
                  name={r.scenario_name}
                  stroke="none"
                  fill={color}
                  fillOpacity={isBaseline ? 0.08 : 0.14}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey={`${r.scenario_name}_p50`}
                  name={r.scenario_name}
                  stroke={color}
                  strokeWidth={isBaseline ? 2 : 2.5}
                  strokeDasharray={isBaseline ? "6 4" : undefined}
                  dot={false}
                  isAnimationActive={false}
                />
              </Fragment>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** One legend for all four charts: a colored line sample (dashed for "if you change
 * nothing") next to every scenario's name, so nothing relies on color alone. */
export function ChartLegend({ results }: { results: ScenarioResultOut[] }) {
  return (
    <ul className="chart-legend" aria-label="Chart key">
      {results.map((r, i) => (
        <li key={r.scenario_name}>
          <svg width="28" height="10" aria-hidden="true">
            <line
              x1="1"
              y1="5"
              x2="27"
              y2="5"
              stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
              strokeWidth="3"
              strokeDasharray={i === 0 ? "6 4" : undefined}
            />
          </svg>
          {displayScenarioName(r.scenario_name)}
        </li>
      ))}
    </ul>
  );
}
