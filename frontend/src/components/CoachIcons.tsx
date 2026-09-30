import type { VerdictKey } from "../api";
import type { Trend } from "../lib/coachView";

/** Small inline SVG icons (no emoji, so they look the same on every device). All are decorative:
 * the words next to them carry the meaning. */
const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export function VerdictIcon({ verdict }: { verdict: VerdictKey }) {
  switch (verdict) {
    case "good":
      return (
        <svg {...base}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case "try":
      return (
        <svg {...base}>
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.6 6.6l2 2M15.4 15.4l2 2M17.4 6.6l-2 2M8.6 15.4l-2 2" />
        </svg>
      );
    case "risky":
      return (
        <svg {...base}>
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17.2v.1" />
        </svg>
      );
    default:
      return (
        <svg {...base}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
  }
}

export function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "up") {
    return (
      <svg {...base} width={14} height={14}>
        <path d="M12 19V5M6 11l6-6 6 6" />
      </svg>
    );
  }
  if (trend === "down") {
    return (
      <svg {...base} width={14} height={14}>
        <path d="M12 5v14M6 13l6 6 6-6" />
      </svg>
    );
  }
  return (
    <svg {...base} width={14} height={14}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function ArrowRight() {
  return (
    <svg {...base} width={14} height={14}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
