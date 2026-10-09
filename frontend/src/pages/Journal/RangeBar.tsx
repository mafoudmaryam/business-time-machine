import type { JournalComparison } from "../../api";
import { POSITION_WORDS, rangeBar } from "../../lib/journalView";

/** One real figure against the expected range: a bar for "bad case to good case", a tick for "most likely", a dot for what
 *  really happened. Plain SVG that scales to any width. The sentence next to it says the same in words. */
export function RangeBar({ comparison, label }: { comparison: JournalComparison; label: string }) {
  const g = rangeBar(comparison);
  const description = `${label}: ${POSITION_WORDS[comparison.position].toLowerCase()}. ${comparison.sentence}`;
  return (
    <svg className="range-bar" viewBox="0 0 100 14" preserveAspectRatio="none" role="img" aria-label={description}>
      <line x1="0" y1="7" x2="100" y2="7" className="range-bar-track" />
      <rect x={g.low} y="3" width={Math.max(g.high - g.low, 0.6)} height="8" rx="2" className="range-bar-range" />
      <line x1={g.expected} y1="1.5" x2={g.expected} y2="12.5" className="range-bar-expected" />
      {/* The dot is a zero-length line with round ends: it stays a true circle even though this picture is stretched sideways. */}
      <line x1={g.actual} y1="7" x2={g.actual + 0.001} y2="7" className="range-bar-actual" />
      <line x1={g.actual} y1="7" x2={g.actual + 0.001} y2="7" className="range-bar-actual-core" />
    </svg>
  );
}
