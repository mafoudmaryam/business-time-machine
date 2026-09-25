/** Plain-language explanation of the band-plus-median charts, for owners who
 * have never seen a percentile band before. Shared by the comparison
 * dashboard and run history, since both render the same MetricChart grid. */
export function ChartCaption() {
  return (
    <p className="chart-caption">
      <strong>ⓘ</strong> The shaded band shows where 8 of 10 simulated futures land; the solid line is the
      median -- the single most typical outcome.
    </p>
  );
}
