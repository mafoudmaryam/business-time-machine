import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getToday, getTodayNote, type TodayNote, type TodayOut } from "../../api";
import { AskCoach } from "../../components/AskCoach";
import { useConfig } from "../../components/config";
import { ErrorBanner } from "../../components/ErrorBanner";
import { InfoTip } from "../../components/InfoTip";
import { Modal } from "../../components/Modal";
import { Spinner } from "../../components/Spinner";
import { Tour } from "../../components/Tour";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { forgetBusiness, getRememberedBusinessId, rememberBusiness, tourSeen } from "../../lib/session";
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
  const coachOn = config.coachEnabled && today.note !== null;

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

      <p className="today-try">
        Thinking about a change?{" "}
        <Link to="/try" onClick={() => track("try_a_change_clicked", "today")}>
          Try a change
        </Link>
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
        <h1>We couldn't open that business</h1>
        <ErrorBanner message={today.error ?? "Something went wrong."} />
        <div className="wizard-nav">
          <button type="button" onClick={today.reload}>
            Try again
          </button>
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
        </div>
      </div>
    );
  }
  return <Loaded today={today.data} reload={today.reload} />;
}
