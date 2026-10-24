/** The one chart colour system. The colours are the ones in theme.css (a chart's SVG cannot read CSS variables in every
 *  place Recharts takes a colour, so the same values are repeated here, and chartTheme.test.ts checks they match).
 *  Green is the main line, amber is caution (the bad case), sage is the range band, charcoal is text and the
 *  "if you change nothing" line. Lines also differ by dash pattern, so colour is never the only clue. */
export const CHART = {
  main: "#5146c8",
  mainDeep: "#272250",
  caution: "#ffbd69",
  /** Amber is too light to be seen as a thin line, so amber lines use the dark amber. */
  cautionLine: "#7a4a00",
  band: "#f0eefb",
  bandEdge: "#dad5ee",
  text: "#202236",
  baseline: "#525365",
  grid: "#e2e1ec",
} as const;

/** Compare page: index 0 is always "if you change nothing". Each series has its own colour AND dash pattern. */
export const SERIES_STYLES = [
  { color: CHART.baseline, dash: "6 4" },
  { color: CHART.main, dash: undefined },
  { color: CHART.cautionLine, dash: "10 3 2 3" },
  { color: CHART.mainDeep, dash: "2 4" },
] as const;

