import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError, createGuideBusiness, getGuidePlan, getGuideSimulator, linkGuideBusiness, recalculateGuidePlan, type GuidePlanOut,
} from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { LoadError } from "../../components/LoadError";
import { Spinner } from "../../components/Spinner";
import { StartingPictureBanner } from "../../components/StartingPictureBanner";
import { useDeleteFlow } from "../../components/useDeleteFlow";
import { useAsync } from "../../hooks/useAsync";
import { track } from "../../lib/events";
import { DISCLAIMER, NEEDS_WORDS, STANDING_LINE, dateText, planTitle, typeWord } from "../../lib/guide";
import { rememberBusiness } from "../../lib/session";
import { BudgetSection, ChecklistSection, HowSection, RunningSection, StartupSection, StrugglesSection, Summary } from "./PlanParts";

/** On paper every checklist card must be open, or its content would not print. Opens them for printing and puts them back after. */
function usePrintOpensChecklist(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const before = () => ref.current?.querySelectorAll("details").forEach((d) => {
      if (!d.open) {
        d.open = true;
        opened.push(d);
      }
    });
    const after = () => {
      opened.forEach((d) => (d.open = false));
      opened.length = 0;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [ref]);
}

function TryIt({ out, onLinked }: { out: GuidePlanOut; onLinked: (next: GuidePlanOut) => void }) {
  const navigate = useNavigate();
  const sim = useAsync(() => getGuideSimulator(out.id), [out.id, out.data_version, JSON.stringify(out.plan.answers)]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const plan = out.plan;

  async function makeBusiness() {
    if (!sim.data?.quick) return;
    setBusy(true);
    setProblem(null);
    try {
      track("guide_try_simulator", "guide_plan", { business_type: plan.business_type, country: plan.country.id });
      const business = await createGuideBusiness(`My future ${typeWord(plan.business_type)} (plan)`, plan.business_type, plan.currency, sim.data.quick);
      const linked = await linkGuideBusiness(out.id, business.id);
      rememberBusiness(business.id);
      onLinked(linked);
      navigate("/today");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "We couldn't set that up just now. Please try again.");
      setBusy(false);
    }
  }

  function openExisting() {
    if (out.business_id === null) return;
    rememberBusiness(out.business_id);
    navigate("/today");
  }

  return (
    <section className="guide-section guide-try" aria-labelledby="guide-try">
      <h2 id="guide-try">Try it in the simulator</h2>
      <p>We will set up a practice business from your answers, so you can slide a price and see twelve months. It shows your place as if it were already open and trading normally, so it is a way to try changes on paper, not a forecast of your first months.</p>
      <StartingPictureBanner />
      {sim.loading && <Spinner label="Checking what the simulator needs…" />}
      {sim.error && <p className="field-error" role="alert">We couldn&apos;t check that just now. Please try again in a moment.</p>}
      {sim.data && !sim.data.ready && (
        <div className="guide-unavailable">
          <p><strong>A few numbers are missing.</strong> To set up a practice business we need: {sim.data.missing.map((m) => NEEDS_WORDS[m] ?? m).join(", ")}. We will not invent them.</p>
          <Link className="btn btn-secondary" to={`/guide?plan=${out.id}&step=8`}>Add them</Link>
        </div>
      )}
      {sim.data?.ready && (
        <>
          {sim.data.notes.map((n) => <p key={n} className="guide-small">{n}</p>)}
          {problem && <p className="field-error" role="alert">{problem}</p>}
          <div className="guide-try-actions">
            {out.business_id !== null && <button type="button" className="btn-amber" onClick={openExisting}>Open your practice business</button>}
            <button type="button" className={out.business_id !== null ? "secondary" : "btn-amber"} disabled={busy} onClick={() => void makeBusiness()}>
              {busy ? "Setting it up…" : out.business_id !== null ? "Make a fresh one" : "Try it in the simulator"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function PlanPage() {
  const { id } = useParams();
  const planId = Number(id);
  const navigate = useNavigate();
  const loaded = useAsync(() => getGuidePlan(planId), [planId]);
  const [override, setOverride] = useState<GuidePlanOut | null>(null);
  const deleteFlow = useDeleteFlow();
  const bodyRef = useRef<HTMLDivElement>(null);
  usePrintOpensChecklist(bodyRef);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    setOverride(null);
  }, [planId]);

  useEffect(() => {
    try {
      setWide(window.matchMedia("(min-width: 700px)").matches);
    } catch {
      setWide(true);
    }
  }, []);

  const out = override ?? loaded.data;
  useEffect(() => {
    if (out) track("screen_view", "guide_plan", { business_type: out.plan.business_type, country: out.plan.country.id });
  }, [out?.id, out?.plan.business_type, out?.plan.country.id]);

  if (loaded.loading && !out) return <div className="page guide-plan"><Spinner label="Working out your plan…" /></div>;
  if (!out) {
    const missing = loaded.error !== null && /not found/i.test(loaded.error);
    return (
      <div className="page guide-plan">
        {missing ? (
          <EmptyState title="We couldn’t find that plan" action={{ label: "Make a new plan", to: "/guide" }}>
            <p>It may have been deleted, or the link is old. Your other things are not affected.</p>
          </EmptyState>
        ) : (
          <LoadError message={loaded.error} what="your plan" onRetry={loaded.reload} />
        )}
      </div>
    );
  }
  const plan = out.plan;

  async function recalc() {
    try {
      setOverride(await recalculateGuidePlan(out!.id));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }

  return (
    <div className="page guide-plan" ref={bodyRef}>
      <header className="guide-header">
        <h1>Your rough start-up plan</h1>
        <p className="guide-subtitle">{planTitle(plan.business_type, plan.country.name)}</p>
        <p className="guide-disclaimer-box" role="note"><strong>{DISCLAIMER}</strong> This is a planning aid, not legal, tax or financial advice.</p>
        <StartingPictureBanner />
        <p className="guide-small">Worked out with data dated {dateText(plan.data_version.split(".")[0])}. Saved on this computer only.</p>
        {out.data_changed && (
          <p className="guide-changed no-print" role="status">
            The data behind this plan has been updated since you last looked, so some numbers may be different now.{" "}
            <button type="button" className="link-button" onClick={() => void recalc()}>Got it</button>
          </p>
        )}
        {plan.warnings.map((w) => <p key={w} className="guide-small">{w}</p>)}
      </header>

      <Summary plan={plan} />
      <StartupSection plan={plan} />
      <RunningSection plan={plan} />
      <BudgetSection plan={plan} />
      <ChecklistSection plan={plan} open={wide} />
      <StrugglesSection plan={plan} />
      <TryIt out={out} onLinked={setOverride} />
      <HowSection plan={plan} />

      <footer className="guide-footer">
        <p className="guide-standing">{STANDING_LINE}</p>
        <div className="guide-actions no-print">
          <button type="button" onClick={() => window.print()}>Print or save as PDF</button>
          <Link className="btn btn-secondary" to={`/guide?plan=${out.id}`}>Change my answers</Link>
          <button
            type="button" className="secondary"
            onClick={() => deleteFlow.ask({
              kind: "plan", id: out.id, name: `your start-up plan for a ${typeWord(plan.business_type)}`,
              onDone: () => navigate("/guide", { replace: true }),
              onUndone: () => navigate(`/guide/plan/${out.id}`),
            })}
          >
            Delete this plan
          </button>
        </div>
      </footer>
      {deleteFlow.dialog}
    </div>
  );
}
