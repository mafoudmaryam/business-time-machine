import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listBusinesses, listSimulationRuns } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { Spinner } from "../components/Spinner";
import { useAsync } from "../hooks/useAsync";

/** Every future you've looked into, newest first. Opening one continues the conversation
 * about it with the advisor. */
export function PastDecisionsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const businessId = Number(params.get("business")) || null;
  const businesses = useAsync(listBusinesses, []);
  const runs = useAsync(() => (businessId ? listSimulationRuns(businessId) : Promise.resolve([])), [businessId]);
  const business = businesses.data?.find((b) => b.id === businessId) ?? null;

  return (
    <div className="past">
      <h1>Past decisions</h1>
      <p className="muted">Every future you've looked into is saved here.</p>

      {businesses.loading && <Spinner label="Loading…" />}
      <ErrorBanner message={businesses.error} />
      {businesses.data && businesses.data.length > 1 && (
        <div className="reply-row" role="group" aria-label="Business">
          {businesses.data.map((b) => (
            <button
              key={b.id}
              type="button"
              className={b.id === businessId ? "chip chip-primary" : "chip"}
              aria-pressed={b.id === businessId}
              onClick={() => setParams({ business: String(b.id) })}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
      {businesses.data && businesses.data.length === 0 && (
        <p>
          Nothing yet. <Link to="/">Start a conversation</Link> to set up your business.
        </p>
      )}
      {!businessId && businesses.data && businesses.data.length === 1 && (
        <button type="button" className="chip" onClick={() => setParams({ business: String(businesses.data![0].id) })}>
          Show {businesses.data[0].name}
        </button>
      )}

      {businessId && (
        <>
          {runs.loading && <Spinner label="Loading past decisions…" />}
          <ErrorBanner message={runs.error} />
          {runs.data && runs.data.length === 0 && (
            <p>
              {business?.name ?? "This business"} hasn't looked into any futures yet.{" "}
              <Link to={`/?business=${businessId}`}>Think one through</Link>.
            </p>
          )}
          <ul className="past-list">
            {runs.data?.map((r) => {
              const names = r.scenario_names.filter((n) => n !== "baseline");
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="past-item"
                    onClick={() => navigate(`/?business=${businessId}`, { state: { reopenRunId: r.id, fresh: Date.now() } })}
                  >
                    <span className="past-name">{names.join(" vs. ") || "Keep things as they are"}</span>
                    <span className="past-meta">
                      {new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })} · {r.horizon} months ahead
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
