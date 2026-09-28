/** Plain-language explanation of the band-plus-line charts, for owners who
 * have never seen a range band before. Shared by the comparison dashboard
 * and run history, since both render the same MetricChart grid. */
export function ChartCaption() {
  return (
    <p className="chart-caption">
      <strong>?</strong> The shaded band shows where 8 of 10 simulated futures land, from bad case to good
      case; the solid line is the most likely outcome.
    </p>
  );
}
