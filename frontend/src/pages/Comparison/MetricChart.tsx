import { Fragment } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScenarioResultOut } from "../../api";
import { InfoTip } from "../../components/InfoTip";
import { CHART, SERIES_STYLES } from "../../chartTheme";
import { DEFAULT_CURRENCY, formatMoney } from "../../lib/format";
import { displayScenarioName } from "../../lib/scenarioLabel";

interface Props {
  title: string;
  tooltip?: string;
  metric: string; // key into ScenarioResultOut.bands, e.g. "revenue"
  results: ScenarioResultOut[]; // baseline first, so SERIES_STYLES[0] is always "if you change nothing"
  isMoney: boolean;
  currency?: string;
}

type ChartRow = { month: number } & Record<string, number | [number, number]>;

function formatValue(value: number, isMoney: boolean, currency: string): string {
  return isMoney ? formatMoney(value, currency) : Math.round(value).toLocaleString();
}

/** One band-plus-median chart, reused for revenue/profit/cash/customers. Each
 * scenario draws a shaded bad-case-to-good-case Area (legend hidden) and a
 * solid most-likely Line (legend shown, so scenarios are always named, never
 * color-only). */
export function MetricChart({ title, tooltip, metric, results, isMoney, currency = DEFAULT_CURRENCY }: Props) {
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
    <div className="metric-chart">
      <h3>
        {title} {tooltip && <InfoTip text={tooltip} />}
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
          <XAxis dataKey="month" label={{ value: "Month", position: "insideBottom", offset: -4 }} />
          <YAxis tickFormatter={(v: number) => formatValue(v, isMoney, currency)} width={80} />
          <Tooltip
            labelFormatter={(month) => `Month ${month}`}
            formatter={(value, name) => {
              const label = displayScenarioName(String(name));
              if (Array.isArray(value)) {
                const [lo, hi] = value as [number, number];
                return [`${formatValue(lo, isMoney, currency)} – ${formatValue(hi, isMoney, currency)}`, `${label} (bad case-good case)`];
              }
              return [formatValue(Number(value), isMoney, currency), `${label} (most likely)`];
            }}
          />
          <Legend formatter={(value) => displayScenarioName(String(value))} />
          {results.map((r, i) => {
            const { color, dash } = SERIES_STYLES[i % SERIES_STYLES.length];
            return (
              <Fragment key={r.scenario_name}>
                <Area
                  type="monotone"
                  dataKey={`${r.scenario_name}_band`}
                  name={r.scenario_name}
                  stroke="none"
                  fill={color}
                  fillOpacity={0.14}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey={`${r.scenario_name}_p50`}
                  name={r.scenario_name}
                  stroke={color}
                  strokeWidth={i === 0 ? 2 : 2.5}
                  strokeDasharray={dash}
                  dot={false}
                  isAnimationActive={false}
                />
              </Fragment>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
