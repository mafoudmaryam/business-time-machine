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
import { SCENARIO_COLORS } from "../../constants";
import { formatMoney } from "../../lib/format";

interface Props {
  title: string;
  metric: string; // key into ScenarioResultOut.bands, e.g. "revenue"
  results: ScenarioResultOut[]; // baseline first, so SCENARIO_COLORS[0] is always the baseline
  isMoney: boolean;
}

type ChartRow = { month: number } & Record<string, number | [number, number]>;

function formatValue(value: number, isMoney: boolean): string {
  return isMoney ? formatMoney(value) : Math.round(value).toLocaleString();
}

/** One band-plus-median chart, reused for revenue/profit/cash/customers. Each
 * scenario draws a shaded p10-p90 Area (legend hidden) and a solid p50 Line
 * (legend shown, so scenarios are always named, never color-only). */
export function MetricChart({ title, metric, results, isMoney }: Props) {
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
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" label={{ value: "Month", position: "insideBottom", offset: -4 }} />
          <YAxis tickFormatter={(v: number) => formatValue(v, isMoney)} width={80} />
          <Tooltip
            labelFormatter={(month) => `Month ${month}`}
            formatter={(value, name) => {
              if (Array.isArray(value)) {
                const [lo, hi] = value as [number, number];
                return [`${formatValue(lo, isMoney)} – ${formatValue(hi, isMoney)}`, `${name} (p10–p90)`];
              }
              return [formatValue(Number(value), isMoney), `${name} (p50)`];
            }}
          />
          <Legend />
          {results.map((r, i) => {
            const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
            return (
              <Fragment key={r.scenario_name}>
                <Area
                  type="monotone"
                  dataKey={`${r.scenario_name}_band`}
                  name={r.scenario_name}
                  stroke="none"
                  fill={color}
                  fillOpacity={0.15}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey={`${r.scenario_name}_p50`}
                  name={r.scenario_name}
                  stroke={color}
                  strokeWidth={2}
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
