import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { getBusinessImpact, getJournal, getToday, getTodayNote, type TodayNote, type TodayOut } from "../../api";
import { AskCoach } from "../../components/AskCoach";
import { useConfig } from "../../components/config";
import { EmptyState } from "../../components/EmptyState";
import { InfoTip } from "../../components/InfoTip";
import { LoadError } from "../../components/LoadError";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { Tour } from "../../components/Tour";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { monthOptions } from "../../lib/journalView";
import { dismissJournalReminder, forgetBusiness, getRememberedBusinessId, journalReminderDismissed, rememberBusiness, tourSeen } from "../../lib/session";
import { industryWord, lowestCashTile, noteIsPending, profitTile, safetyTile, type Tile } from "../../lib/todayView";
import { Assumptions } from "./Assumptions";
import { TodayChart } from "./TodayChart";

const POLL_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 15 * 60 * 1000;

function TileCard({ tile }: { tile: Tile }) {
  return (
    <div className={`today-tile today-tile-${tile.tone}`}>
      <h3>
        {tile.title} <InfoTip text={tile.help} />
      </h3>
      <p className="today-tile-number">{tile.headline}</p>
      <p>{tile.detail}</p>
      {tile.risk && <p className="today-tile-risk">{tile.risk}</p>}
    </div>
  );
}

/** The coach's opening words. The rule-based note is there at once; a better AI note may replace it a little later. */
function CoachNote({ note, businessId, onAsk }: { note: TodayNote; businessId: number; onAsk: () => void }) {
  const [current, setCurrent] = useState(note);
  const [updated, setUpdated] = useState(false);
  const startedAt = useRef(0);

  const pending = noteIsPending(current);
  useEffect(() => {
    if (!pending) return;
    startedAt.current = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt.current > GIVE_UP_AFTER_MS) {
        setCurrent((c) => ({ ...c, ai_status: "failed" }));
        return;
      }
      getTodayNote(businessId).then(
        (n) => {
          if (n.ai_status === "pending") return;
          setCurrent(n);
          setUpdated(n.ai_status === "done");
        },
        () => undefined, // a failed poll is ignored; the note we already have stays
      );
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [pending, businessId]);

  return (
    <section className="today-coach" aria-labelledby="today-coach-title">
      <h2 id="today-coach-title">Your coach says</h2>
      <p className="today-coach-text">{current.text}</p>
      {pending && (
        <p className="coach-adding" role="status">
          Your coach is adding more detail…
        </p>
      )}
      {updated && <p className="coach-updated-tag">Updated with more detail</p>}
      <button type="button" className="link-button" onClick={onAsk}>
        Ask a question
      </button>
    </section>
  );
}

function Loaded({ today, reload }: { today: TodayOut; reload: () => void }) {
  const config = useConfig();
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [touring, setTouring] = useState(() => !tourSeen());
  const industryName = industryWord(today.industry);
  const { hash } = useLocation();
  // Nothing saved yet (no scenarios, no runs)? Then say so kindly and point at the one next step. If the count cannot be loaded, say nothing.
  const saved = useAsync(() => getBusinessImpact(today.business_id), [today.business_id]);
  const nothingSaved = saved.data !== null && saved.data.scenarios === 0 && saved.data.runs === 0;
  const coachOn = config.coachEnabled && today.note !== null;

  // "Change this" on the how-we-worked-it-out page lands on #assumed: scroll to the list once the page is there.
  useEffect(() => {
    if (hash === "#assumed") document.getElementById("assumed")?.scrollIntoView?.({ block: "start" });
  }, [hash, today.run_id]);

  useEffect(() => {
    rememberBusiness(today.business_id);
    track("screen_view", "today", { sample: today.is_sample });
  }, [today.business_id, today.is_sample]);

  return (
    <div className="page today-page">
      <h1>
        Today at {today.name}
        {today.is_sample && <span className="sample-tag">Sample business</span>}
      </h1>
      {today.is_sample && (
        <div className="sample-banner">
          <p>This is a sample {industryName}: example numbers, not a real business.</p>
          <button type="button" onClick={() => navigate("/")}>
            Start with my own numbers
          </button>
        </div>
      )}

      {coachOn && today.note && (
        <CoachNote
          key={today.run_id}
          note={today.note}
          businessId={today.business_id}
          onAsk={() => {
            track("ask_opened", "today");
            setAsking(true);
          }}
        />
      )}

      <div className="today-tiles">
        <TileCard tile={profitTile(today.tiles, today.currency)} />
        <TileCard tile={safetyTile(today.tiles, today.currency)} />
        <TileCard tile={lowestCashTile(today.tiles, today.currency)} />
      </div>

      <TodayChart today={today} />

      {nothingSaved ? (
        <EmptyState compact title="You haven't tried a change yet" action={{ label: "Try a change", to: "/try" }}>
          <p>Everything above is how things stand today. When you try a change, you'll see here what it could do.</p>
        </EmptyState>
      ) : (
        <p className="today-try">
          Thinking about a change?{" "}
          <Link to="/try" onClick={() => track("try_a_change_clicked", "today")}>
            Try a change
          </Link>
        </p>
      )}

      <JournalPrompt businessId={today.business_id} />

      <p className="today-links">
        <Link to="/how">How did we get these numbers?</Link> · <Link to="/share">Print or share this summary</Link> ·{" "}
        <Link to="/journal">My journal</Link>
      </p>

      <Assumptions
        businessId={today.business_id}
        currency={today.currency}
        industryName={industryName}
        assumptions={today.assumptions}
        isSample={today.is_sample}
        onChanged={reload}
      />

      <p className="disclaimer">
        Scenarios, not forecasts. Built from typical numbers and the ones you gave us. Not financial advice.
      </p>

      {asking && coachOn && (
        <Modal title="Ask a question" onClose={() => setAsking(false)}>
          <AskCoach runId={today.run_id} />
        </Modal>
      )}
      {touring && <Tour onClose={() => setTouring(false)} />}
    </div>
  );
}

/** One quiet line when LAST month is missing from the journal (and we had made a forecast for it). The owner can dismiss it,
 *  and then it never comes back for that month. If the journal cannot be read, nothing is shown: a nudge, never a blocker. */
function JournalPrompt({ businessId }: { businessId: number }) {
  const journal = useAsync(() => Promise.resolve().then(() => getJournal(businessId)), [businessId]);
  const [hidden, setHidden] = useState(false);
  const now = new Date();
  const last = monthOptions(now, 2)[1].value;
  const due = journal.data?.due.find((d) => d.month === last);
  if (!due || hidden || journalReminderDismissed(businessId, due.month)) return null;
  return (
    <p className="journal-prompt">
      <span>Last month isn't in your journal yet.</span>
      <Link to={`/journal?month=${due.month}`} onClick={() => track("journal_prompt_clicked", "today")}>
        Write it down
      </Link>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          dismissJournalReminder(businessId, due.month);
          track("journal_prompt_dismissed", "today");
          setHidden(true);
        }}
      >
        Not now
      </button>
    </p>
  );
}

export function TodayPage() {
  const navigate = useNavigate();
  // Only a business the owner chose in this visit. Never "the first one in the database".
  const id = getRememberedBusinessId();
  const today = useAsync(() => (id ? getToday(id) : Promise.reject(new Error("no business"))), [id]);

  if (!id) return <Navigate to="/" replace />;
  if (today.loading && !today.data) {
    return (
      <div className="page">
        <Spinner label="Your coach is looking at your numbers…" />
      </div>
    );
  }
  if (today.error || !today.data) {
    return (
      <div className="page">
        <LoadError
          message={today.error}
          what="that business"
          onRetry={today.reload}
          extra={
            <button
              type="button"
              className="secondary"
              onClick={() => {
                forgetBusiness();
                navigate("/");
              }}
            >
              Start fresh
            </button>
          }
        />
      </div>
    );
  }
  return <Loaded today={today.data} reload={today.reload} />;
}
