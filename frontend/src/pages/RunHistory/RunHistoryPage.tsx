import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSimulationRun, listBusinesses, listSimulationRuns, type SimulationRunOut } from "../../api";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { MetricChart } from "../Comparison/MetricChart";
import { RiskAlerts } from "../Comparison/RiskAlert";
import { RunMeta } from "../Comparison/RunMeta";
import { SummaryTable } from "../Comparison/SummaryTable";

const CHARTS: { metric: string; title: string; isMoney: boolean }[] = [
  { metric: "revenue", title: "Revenue", isMoney: true },
  { metric: "profit", title: "Profit", isMoney: true },
  { metric: "cash", title: "Cash", isMoney: true },
  { metric: "customers", title: "Customers", isMoney: false },
];

export function RunHistoryPage() {
  const [params, setParams] = useSearchParams();
  const businessId = params.get("business") ? Number(params.get("business")) : null;

  const businesses = useAsync(listBusinesses, []);
  const runs = useAsync(() => (businessId ? listSimulationRuns(businessId) : Promise.resolve([])), [businessId]);

  const [openedRun, setOpenedRun] = useState<SimulationRunOut | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);

  function selectBusiness(id: number) {
    setParams({ business: String(id) });
    setOpenedRun(null);
    setOpenError(null);
  }

  async function openRun(id: number) {
    setOpeningId(id);
    setOpenError(null);
    try {
      const run = await getSimulationRun(id);
      setOpenedRun(run);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="page">
      <h1>Run history</h1>

      <div className="field">
        <label htmlFor="business-select">Business</label>
        {businesses.loading && <Spinner label="Loading businesses…" />}
        <ErrorBanner message={businesses.error} />
        {businesses.data && (
          <select
            id="business-select"
            value={businessId ?? ""}
            onChange={(e) => selectBusiness(Number(e.target.value))}
          >
            <option value="" disabled>
              Choose a business…
            </option>
            {businesses.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {businessId && (
        <>
          {runs.loading && <Spinner label="Loading run history…" />}
          <ErrorBanner message={runs.error} />
          {runs.data && runs.data.length === 0 && <p className="empty-hint">No simulation runs yet.</p>}
          {runs.data && runs.data.length > 0 && (
            <table className="run-history-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Created</th>
                  <th>Horizon</th>
                  <th>Scenarios</th>
                  <th>Seed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.horizon} months</td>
                    <td>{r.scenario_names.join(", ")}</td>
                    <td>{r.seed}</td>
                    <td>
                      <button type="button" className="link-button" onClick={() => openRun(r.id)}>
                        {openingId === r.id ? "Opening…" : "Reopen"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <ErrorBanner message={openError} />

          {openedRun && (
            <section className="run-results">
              <h2>Run #{openedRun.id}</h2>
              <RiskAlerts results={openedRun.results} />
              <div className="chart-grid">
                {CHARTS.map((c) => (
                  <MetricChart
                    key={c.metric}
                    title={c.title}
                    metric={c.metric}
                    results={openedRun.results}
                    isMoney={c.isMoney}
                  />
                ))}
              </div>
              <SummaryTable results={openedRun.results} />
              <RunMeta run={openedRun} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
