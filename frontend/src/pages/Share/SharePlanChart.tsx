import { CHART, chartGeometry, type PlanRow } from "../../lib/share";

interface Props {
  rows: PlanRow[];
  format: (value: number) => string;
  /** Said to screen readers instead of the picture. */
  label: string;
}

/** A plain SVG chart: the bad-to-good band, the most likely line and (if given) a thin dashed "if you change nothing" line.
 *  It has a fixed shape that scales to any width, so on paper it is never cut off, with a purple median and a dashed baseline that remain distinct in grayscale. */
export function SharePlanChart({ rows, format, label }: Props) {
  const g = chartGeometry(rows);
  return (
    <svg className="plan-chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={label}>
      {g.yTicks.map((t) => (
        <g key={t.y}>
          <line stroke="#ded9e7" strokeWidth="1" className="plan-grid" x1={CHART.left} x2={CHART.width - CHART.right} y1={t.y} y2={t.y} />
          <text fill="#514a5f" fontSize="12" className="plan-axis" x={CHART.left - 8} y={t.y + 4} textAnchor="end">
            {format(t.value)}
          </text>
        </g>
      ))}
      <polygon fill="#ded3f5" fillOpacity="0.8" className="plan-band" points={g.band} />
      {g.baseline && <polyline stroke="#55505f" strokeWidth="1.7" strokeDasharray="6 4" className="plan-baseline" points={g.baseline} fill="none" />}
      <polyline stroke="#6847c7" strokeWidth="3" className="plan-median" points={g.median} fill="none" />
      {g.xTicks.map((t) => (
        <text fill="#514a5f" fontSize="12" key={t.label + t.x} className="plan-axis" x={t.x} y={CHART.height - 8} textAnchor={t.anchor}>
          {t.label}
        </text>
      ))}
    </svg>
  );
}
