/** Keep the assumptions visible beside results, including reopened runs. */
export function ResultAssumptions() {
  return (
    <aside className="chart-caption" aria-label="What these estimates depend on">
      <p><strong>These are simulated outcomes.</strong> The results depend on the numbers and assumptions used. A result such as 100% describes the simulated futures, not a measured chance of success for your business.</p>
      <p><strong>If you change marketing:</strong> the estimate depends on how many extra customers advertising attracts and whether your business can serve them. The model's marketing response has not been checked against real business data. Extra spending can reduce profit if it brings too few customers or you are already at capacity.</p>
    </aside>
  );
}
