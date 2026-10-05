import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { getHow, type HowOut } from "../../api";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { CHANGE_ASSUMPTION_LINK, LIMITS, formatHowValue, howMadeSentences } from "../../lib/how";
import { getRememberedBusinessId } from "../../lib/session";
import { industryWord } from "../../lib/todayView";

function Loaded({ how }: { how: HowOut }) {
  const noun = industryWord(how.industry);
  const dollars = how.currency !== "USD" && how.assumed.some((a) => a.unit === "money");

  useEffect(() => {
    track("screen_view", "how", { sample: how.is_sample });
  }, [how.is_sample]);

  return (
    <div className="page how-page">
      <h1>How we worked it out</h1>
      <p className="try-lead">Here is where every number on your screens comes from, in plain words. Nothing on this page is written by an AI.</p>

      <section className="how-section" aria-labelledby="how-told">
        <h2 id="how-told">What you told us</h2>
        {how.is_sample ? (
          <p>
            This is a sample business, so you haven't entered numbers of your own yet. Every number is a typical one for a small {noun}.{" "}
            <Link to="/">Start with my own numbers</Link>
          </p>
        ) : how.told.length === 0 ? (
          <p>Nothing yet: every number was filled in by us (see the next part).</p>
        ) : (
          <dl className="how-list">
            {how.told.map((item) => (
              <div key={item.key} className="how-row">
                <dt>{item.label}</dt>
                <dd>{formatHowValue(item, how.currency)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="how-section" id="how-assumed" aria-labelledby="how-assumed-title">
        <h2 id="how-assumed-title">What we assumed</h2>
        {how.assumed.length === 0 ? (
          <p>Nothing. Every number is one you entered yourself.</p>
        ) : (
          <>
            <p>
              These are our guesses, from simple rules or from what is typical for a small {noun}. They are not facts about your business, so
              change any that is not right.
            </p>
            {dollars && (
              <p className="currency-notice" role="note">
                The typical pay, marketing and cash amounts are US dollars. Please change them to your own amounts in {how.currency}.
              </p>
            )}
            <ul className="how-assumed-list">
              {how.assumed.map((a) => (
                <li key={a.field} className="how-row how-row-assumed">
                  <div>
                    <p className="how-label">
                      {a.label}: <strong>{formatHowValue(a, how.currency)}</strong> <span className="assumed-tag">Assumed</span>
                    </p>
                    <p className="assumed-rule">{a.rule}</p>
                  </div>
                  <Link className="how-change" to={CHANGE_ASSUMPTION_LINK} aria-label={`Change ${a.label}`}>
                    Change this
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="how-section" aria-labelledby="how-made">
        <h2 id="how-made">How the answer is made</h2>
        {howMadeSentences(how.run).map((s) => (
          <p key={s}>{s}</p>
        ))}
      </section>

      <section className="how-section" aria-labelledby="how-limits">
        <h2 id="how-limits">What we do not know</h2>
        <ul className="how-limits">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <p className="how-links">
        <Link to="/share">Print or share a summary</Link> · <Link to="/today">Back to Today</Link>
      </p>
    </div>
  );
}

export function HowPage() {
  const id = getRememberedBusinessId();
  const how = useAsync(() => (id ? getHow(id) : Promise.reject(new Error("no business"))), [id]);

  if (!id) return <Navigate to="/" replace />;
  if (how.loading && !how.data) {
    return (
      <div className="page">
        <Spinner label="Gathering the details…" />
      </div>
    );
  }
  if (how.error || !how.data) {
    return (
      <div className="page">
        <LoadError message={how.error} what="this page" onRetry={how.reload} extra={<Link className="empty-action empty-action-quiet" to="/">Go to the start screen</Link>} />
      </div>
    );
  }
  return <Loaded how={how.data} />;
}
