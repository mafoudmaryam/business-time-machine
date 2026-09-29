import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getSimulationRun, listBusinesses, listIndustries, listSimulationRuns, type SimulationRunOut } from "../../api";
import { BusinessPicker } from "../../components/BusinessPicker";
import { ErrorBanner } from "../../components/ErrorBanner";
import { PageHeading } from "../../components/PageHeading";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { readBusinessId, withBusiness } from "../../lib/businessParam";
import { DEFAULT_CURRENCY } from "../../lib/format";
import { displayScenarioName } from "../../lib/scenarioLabel";
import { RunResults } from "../Comparison/RunResults";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function RunHistoryPage() {
  const [params, setParams] = useSearchParams();
  const businessId = readBusinessId(params);

  const businesses = useAsync(listBusinesses, []);
  const industries = useAsync(listIndustries, []);
  const runs = useAsync(() => (businessId ? listSimulationRuns(businessId) : Promise.resolve([])), [businessId]);

  const selectedBusiness = businesses.data?.find((b) => b.id === businessId) ?? null;
  const industry = industries.data?.find((i) => i.id === selectedBusiness?.industry) ?? null;
  const customerNoun = industry?.customer_noun ?? "customers";
  const currency = selectedBusiness?.currency ?? DEFAULT_CURRENCY;

  const [openedRun, setOpenedRun] = useState<SimulationRunOut | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // After a past result opens, scroll down to it -- otherwise on a long list it
  // opens off-screen and looks like nothing happened.
  useEffect(() => {
    if (openedRun) resultsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [openedRun]);

  function selectBusiness(id: number) {
    setParams({ business: String(id) });
    setOpenedRun(null);
    setOpenError(null);
  }

  async function openRun(id: number) {
    setOpeningId(id);
    setOpenError(null);
    try {
      setOpenedRun(await getSimulationRun(id));
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="page">
      <PageHeading title="Past results" subtitle="Every simulation you have run is saved here. Open one to see it again." />

      <BusinessPicker businesses={businesses} businessId={businessId} onSelect={selectBusiness} />

      {businessId && (
        <>
          {runs.loading && <Spinner label="Loading past results…" />}
          <ErrorBanner message={runs.error} />
          {runs.data && runs.data.length === 0 && (
            <div className="empty-state">
              <p>No simulations yet.</p>
              <Link to={withBusiness("/compare", businessId)} className="button">
                Run your first comparison
              </Link>
            </div>
          )}
          {runs.data && runs.data.length > 0 && (
            <ul className="history-list">
              {runs.data.map((r) => {
                const isOpen = openedRun?.id === r.id;
                return (
                  <li key={r.id} className={isOpen ? "history-item is-open" : "history-item"}>
                    <div className="history-main">
                      <p className="history-title">
                        {r.scenario_names
                          .filter((n) => n !== "baseline")
                          .map(displayScenarioName)
                          .join(" vs. ") || "If you change nothing"}
                      </p>
                      <p className="history-meta">
                        {formatDate(r.created_at)} · {r.horizon} months · run #{r.id} · seed {r.seed}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={isOpen ? "button-secondary" : undefined}
                      onClick={() => openRun(r.id)}
                      disabled={openingId === r.id}
                      aria-label={`Open run #${r.id}`}
                    >
                      {openingId === r.id ? "Opening…" : isOpen ? "Showing" : "Open"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <ErrorBanner message={openError} />

          {openedRun && (
            <div ref={resultsRef} className="scroll-target">
              <h2 className="section-title">Run #{openedRun.id}</h2>
              <RunResults run={openedRun} currency={currency} customerNoun={customerNoun} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
