import { CHART, chartGeometry, type PlanRow } from "../../lib/share";

interface Props {
  rows: PlanRow[];
  format: (value: number) => string;
  /** Said to screen readers instead of the picture. */
  label: string;
}

/** A plain SVG chart: the bad-to-good band, the most likely line and (if given) a thin dashed "if you change nothing" line.
 *  It has a fixed shape that scales to any width, so on paper it is never cut off, and it is drawn in black and grey when printed. */
export function SharePlanChart({ rows, format, label }: Props) {
  const g = chartGeometry(rows);
  return (
    <svg className="plan-chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={label}>
      {g.yTicks.map((t) => (
        <g key={t.y}>
          <line className="plan-grid" x1={CHART.left} x2={CHART.width - CHART.right} y1={t.y} y2={t.y} />
          <text className="plan-axis" x={CHART.left - 8} y={t.y + 4} textAnchor="end">
            {format(t.value)}
          </text>
        </g>
      ))}
      <polygon className="plan-band" points={g.band} />
      {g.baseline && <polyline className="plan-baseline" points={g.baseline} fill="none" />}
      <polyline className="plan-median" points={g.median} fill="none" />
      {g.xTicks.map((t) => (
        <text key={t.label + t.x} className="plan-axis" x={t.x} y={CHART.height - 8} textAnchor={t.anchor}>
          {t.label}
        </text>
      ))}
    </svg>
  );
}
