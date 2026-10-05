import type { JournalForecastMonth, JournalMonthOut } from "../../api";
import { formatMoney } from "../../lib/format";
import { chartGeometry } from "../../lib/journalView";

/** The 12-month "what you keep" forecast (bad case to good case, with the most likely line) and a dot for every month the
 *  owner wrote down. Plain SVG that scales to any width. The list under it says the same in words. */
export function JournalChart({ months, entries, currency }: { months: JournalForecastMonth[]; entries: JournalMonthOut[]; currency: string }) {
  const g = chartGeometry(months, entries);
  const label =
    `What you keep each month, ${g.firstLabel} to ${g.lastLabel}: the shaded band runs from a bad case to a good case, the line is the most likely. ` +
    (g.dots.length === 0 ? "You have not written any of these months down yet." : `Dots mark ${g.dots.length === 1 ? "the month" : "the months"} you wrote down: ${g.dots.map((d) => d.label).join(", ")}.`);
  return (
    <figure className="journal-chart">
      <svg viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <path d={g.bandPath} className="journal-chart-band" />
        <path d={g.medianPath} className="journal-chart-line" fill="none" />
        {g.dots.map((d) => (
          <circle key={d.month} cx={d.x} cy={d.y} r="6" className={`journal-chart-dot journal-chart-dot-${d.position ?? "none"}`} />
        ))}
      </svg>
      <figcaption>
        <span className="journal-chart-key journal-chart-key-band">Bad case to good case</span>
        <span className="journal-chart-key journal-chart-key-line">Most likely</span>
        <span className="journal-chart-key journal-chart-key-dot">What you wrote down</span>
        <span className="journal-chart-range">
          {g.firstLabel} to {g.lastLabel} · highest {formatMoney(g.top, currency)}, lowest {formatMoney(g.bottom, currency)}
        </span>
      </figcaption>
    </figure>
  );
}
