/** Visible context for simulated results; also stays inside the printed summary. */
export function ResultAssumptions({ marketing = true, label = "What these estimates depend on" }: { marketing?: boolean; label?: string }) {
  return (
    <aside className="chart-caption" aria-label={label}>
      <p>These results depend on your numbers and the model’s assumptions. Shares such as 9 out of 10 describe simulated futures, not a measured chance of real-world success.</p>
      {marketing && <p>If you change marketing, the estimate depends on how many extra customers advertising attracts and whether your business can serve them. The model’s marketing response has not been checked against real business data. Extra spending can reduce profit if it brings too few customers or you are already at capacity.</p>}
    </aside>
  );
}
