import type { GuideChecklistItem, GuideLine, GuidePlan, GuideSource } from "../../api";
import {
  NEEDS_WORDS, NOT_AFFILIATED, VERDICT_TILE, basisText, dateText, lineValue, money, moneyRange, newestCheck, trioText,
} from "../../lib/guide";

/** The pieces of the plan page. Every number shown here was worked out by the engine and has a named source or a stated assumption. */

export function SourceLink({ source, short = false }: { source: GuideSource; short?: boolean }) {
  return (
    <span className="guide-source">
      <a href={source.url} target="_blank" rel="noopener noreferrer">{short ? source.name.split(",")[0] : source.name}</a>
      <span className="guide-source-kind"> ({source.kind_text}; read {dateText(source.accessed)})</span>
    </span>
  );
}

function Basis({ line }: { line: GuideLine }) {
  const text = basisText(line.basis);
  return text ? <span className="guide-tag">{text}</span> : null;
}

/** A table of sourced lines: what, how much, and where it comes from. On a phone each line becomes a small card. */
function LinesTable({ lines, caption }: { lines: GuideLine[]; caption: string }) {
  return (
    <table className="guide-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr><th scope="col">Item</th><th scope="col">Published guides say</th><th scope="col">From</th></tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id}>
            <th scope="row">{l.label}{l.note && <span className="guide-note">{l.note}</span>}</th>
            <td data-label="Range"><strong>{lineValue(l)}</strong> <Basis line={l} /></td>
            <td data-label="Source">{l.source && <SourceLink source={l.source} short />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Summary({ plan }: { plan: GuidePlan }) {
  const { running, break_even: be, budget } = plan;
  const tone = VERDICT_TILE[budget.verdict];
  const c = plan.currency;
  return (
    <section className="guide-section" aria-labelledby="guide-summary">
      <h2 id="guide-summary">The short version</h2>
      <div className="guide-tiles">
        <div className="guide-tile">
          <h3>Running costs a month</h3>
          {running.available ? (
            <>
              <p className="guide-tile-number">{trioText({ low: running.low!, middle: running.middle!, high: running.high! }, c)}</p>
              <p>{running.partial ? "Fixed costs only so far: add your customers and spend to see ingredients and marketing." : "Ingredients, people, rent and other bills, and marketing."}</p>
            </>
          ) : (
            <p className="guide-tile-missing">{running.reason}</p>
          )}
        </div>
        <div className="guide-tile">
          <h3>Customers a day to break even</h3>
          {be.available && be.per_day_with_cushion ? (
            <>
              <p className="guide-tile-number">about {Math.ceil(be.per_day_with_cushion.low)}{be.per_day_with_cushion.high > be.per_day_with_cushion.low ? ` to ${Math.ceil(be.per_day_with_cushion.high)}` : ""}</p>
              <p>Including a {be.cushion_percent}% cushion.{be.verdict_text ? ` ${be.verdict_text}` : ""}</p>
            </>
          ) : (
            <p className="guide-tile-missing">{be.reason}</p>
          )}
        </div>
        <div className={`guide-tile guide-tile-${tone.tone}`}>
          <h3>Your budget</h3>
          <p className="guide-tile-number">{tone.title}</p>
          <p>{budget.text}</p>
        </div>
      </div>
      <p className="guide-small">The start-up cost is shown line by line below, because published guides disagree too much for one number.</p>
    </section>
  );
}

export function StartupSection({ plan }: { plan: GuidePlan }) {
  const s = plan.startup;
  const c = plan.currency;
  return (
    <section className="guide-section" aria-labelledby="guide-startup">
      <h2 id="guide-startup">What it might cost to start</h2>
      {!s.available ? (
        <div className="guide-unavailable">
          <p><strong>No start-up total for your case.</strong> {s.reason}</p>
        </div>
      ) : (
        <>
          <p className="guide-lead">{s.label}. These lines come from published guides written by companies that sell to shops, restaurants and new businesses.</p>
          <LinesTable lines={s.lines} caption="Start-up cost lines" />
          <div className="guide-total">
            <p className="guide-total-label">All the lines added up</p>
            <p className="guide-total-number">{moneyRange(s.low!, s.high!, c)}</p>
            <p className="guide-wide">{s.why_wide}</p>
            {s.cross_check && (
              <p className="guide-small">
                For comparison, {s.cross_check.source ? <SourceLink source={s.cross_check.source} short /> : "the guide"} gives its own total ({s.cross_check.label.toLowerCase()}) as {lineValue(s.cross_check)}. The lines above add up differently because the guide lists some single values and open-ended ranges.
              </p>
            )}
          </div>
          {s.notes.map((n) => <p key={n} className="guide-small">{n}</p>)}
        </>
      )}
    </section>
  );
}

export function RunningSection({ plan }: { plan: GuidePlan }) {
  const r = plan.running;
  const be = plan.break_even;
  const c = plan.currency;
  return (
    <section className="guide-section" aria-labelledby="guide-running">
      <h2 id="guide-running">Running costs and break-even</h2>
      {!r.available ? (
        <div className="guide-unavailable">
          <p><strong>We need a few numbers from you.</strong> {r.reason}</p>
          {r.needs && r.needs.length > 0 && (
            <ul>{r.needs.map((n) => <li key={n}>{NEEDS_WORDS[n] ?? n}</li>)}</ul>
          )}
          <p className="guide-small">Use “Change my answers” below to add them. We never guess them for you.</p>
        </div>
      ) : (
        <>
          <table className="guide-table guide-table-plain">
            <caption className="visually-hidden">Running costs a month</caption>
            <thead><tr><th scope="col">A month</th><th scope="col">Range</th><th scope="col">How it is worked out</th></tr></thead>
            <tbody>
              {r.lines!.map((l) => (
                <tr key={l.key}>
                  <th scope="row">{l.label}</th>
                  <td data-label="Range"><strong>{moneyRange(l.low, l.high, c)}</strong></td>
                  <td data-label="How">{l.how}</td>
                </tr>
              ))}
              <tr className="guide-total-row">
                <th scope="row">Together</th>
                <td data-label="Range"><strong>{moneyRange(r.low!, r.high!, c)}</strong></td>
                <td data-label="How">{r.partial ? "fixed costs only so far" : "all four lines added up"}</td>
              </tr>
            </tbody>
          </table>
          {(r.notes ?? []).map((n) => <p key={n} className="guide-small">{n}</p>)}
          {r.ingredient_from === "published" && r.ingredient_share !== undefined && (
            <p className="guide-small">Ingredients use the published median of {r.ingredient_share}% of sales. The association says such figures are not standards for any one business.</p>
          )}
          {r.ingredient_from === "you" && <p className="guide-small">Ingredients use your own estimate of {r.ingredient_share}% of sales.</p>}
          {r.labour_check && (
            <p className="guide-small">
              People cost about {r.labour_check.share_of_sales[0]}{r.labour_check.share_of_sales[1] !== r.labour_check.share_of_sales[0] ? ` to ${r.labour_check.share_of_sales[1]}` : ""}% of your sales
              {r.labour_check.published ? `; published figures for comparison: ${lineValue(r.labour_check.published)}.` : ". We have no published figure for your country to compare it with."}
            </p>
          )}
        </>
      )}
      <h3>Break-even</h3>
      {!be.available ? (
        <p className="guide-tile-missing">{be.reason}</p>
      ) : (
        <ol className="guide-steps">
          <li>Fixed costs a month (people, rent and other bills, marketing): <strong>{moneyRange(be.fixed_costs!.low, be.fixed_costs!.high, c)}</strong></li>
          <li>Each customer adds, after ingredients: <strong>{money(be.each_customer_adds!, c)}</strong></li>
          <li>Customers needed a month: <strong>{Math.ceil(be.customers_per_month!.low)}{be.customers_per_month!.high > be.customers_per_month!.low ? ` to ${Math.ceil(be.customers_per_month!.high)}` : ""}</strong></li>
          <li>A day ({be.days_open} days open): <strong>about {Math.ceil(be.per_day!.low)}{be.per_day!.high > be.per_day!.low ? ` to ${Math.ceil(be.per_day!.high)}` : ""}</strong></li>
          <li>
            With a {be.cushion_percent}% cushion
            {be.cushion_row?.source && <> (the <SourceLink source={be.cushion_row.source} short /> suggests one)</>}:{" "}
            <strong>about {Math.ceil(be.per_day_with_cushion!.low)}{be.per_day_with_cushion!.high > be.per_day_with_cushion!.low ? ` to ${Math.ceil(be.per_day_with_cushion!.high)}` : ""} a day</strong>
          </li>
        </ol>
      )}
    </section>
  );
}

export function BudgetSection({ plan }: { plan: GuidePlan }) {
  const { budget, buffer, startup } = plan;
  const c = plan.currency;
  return (
    <section className="guide-section" aria-labelledby="guide-budget">
      <h2 id="guide-budget">A starting budget with a cushion</h2>
      {!budget.available ? (
        <p className="guide-tile-missing">{budget.text}</p>
      ) : (
        <>
          <ul className="guide-sum">
            <li><span>Start-up cost (the lines above)</span><strong>{moneyRange(startup.low!, startup.high!, c)}</strong></li>
            <li><span>Contingency for surprises ({budget.contingency!.percent[0]}% to {budget.contingency!.percent[1]}%, our assumption)</span><strong>{moneyRange(budget.contingency!.low, budget.contingency!.high, c)}</strong></li>
            <li><span>Cash buffer ({buffer.months![0]} to {buffer.months![1]} months of running costs, our assumption)</span><strong>{moneyRange(buffer.low!, buffer.high!, c)}</strong></li>
            <li className="guide-sum-total"><span>A suggested starting budget</span><strong>{moneyRange(budget.suggested_low!, budget.suggested_high!, c)}</strong></li>
          </ul>
          <p className="guide-wide">The middle of that range is {money(budget.suggested_middle!, c)}. It is the middle of a wide range, not a prediction.</p>
          <p className={`guide-verdict guide-verdict-${VERDICT_TILE[budget.verdict].tone}`}>{budget.text}</p>
        </>
      )}
    </section>
  );
}

function ChecklistCard({ item, open }: { item: GuideChecklistItem; open: boolean }) {
  return (
    <details className="guide-check" open={open}>
      <summary>
        {item.title}
        {item.urgent && <span className="guide-tag guide-tag-urgent">Start here</span>}
      </summary>
      <div className="guide-check-body">
        {item.urgent && <p className="guide-small">{item.urgent}</p>}
        <h3>What to do</h3>
        <ul>{item.do.map((t) => <li key={t}>{t}</li>)}</ul>
        <h3>Typical cost</h3>
        {item.costs.length > 0 ? (
          <ul className="guide-costs">
            {item.costs.map((l) => (
              <li key={l.id}>
                {l.label}: <strong>{lineValue(l)}</strong> <Basis line={l} />
                {l.source && <> — <SourceLink source={l.source} short /></>}
              </li>
            ))}
          </ul>
        ) : (
          <p>We have no sourced figure for this. Ask a local supplier or agent.</p>
        )}
        <h3>Where to find it</h3>
        <ul>{item.where_kinds.map((t) => <li key={t}>{t}</li>)}</ul>
        {item.where_sources.length > 0 && (
          <ul className="guide-links">
            {item.where_sources.map((s) => <li key={s.id}>Official page: <SourceLink source={s} /></li>)}
          </ul>
        )}
        {item.cant && (
          <p className="guide-cant" role="note">
            {item.cant}
            {item.where_sources.length > 0 && <> Visit: {item.where_sources.map((s, i) => <span key={s.id}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.name.split(",")[0]}</a></span>)}.</>}
          </p>
        )}
      </div>
    </details>
  );
}

export function ChecklistSection({ plan, open }: { plan: GuidePlan; open: boolean }) {
  return (
    <section className="guide-section" aria-labelledby="guide-checklist">
      <h2 id="guide-checklist">Your first-year checklist</h2>
      <p className="guide-lead">Nine things to sort out, with where to look. We name only official or reference pages we have read, never shops or suppliers.</p>
      {plan.checklist.map((item) => <ChecklistCard key={item.id} item={item} open={open} />)}
    </section>
  );
}

export function StrugglesSection({ plan }: { plan: GuidePlan }) {
  return (
    <section className="guide-section" aria-labelledby="guide-struggles">
      <h2 id="guide-struggles">What you will probably struggle with</h2>
      <div className="guide-struggles">
        {plan.struggles.map((s) => (
          <article key={s.id} className="guide-struggle">
            <h3>{s.title}</h3>
            <p>{s.what}</p>
            <p><strong>What to watch:</strong> {s.watch}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HowSection({ plan }: { plan: GuidePlan }) {
  const checked = newestCheck(plan.sources);
  return (
    <section className="guide-section" aria-labelledby="guide-how">
      <h2 id="guide-how">How we worked it out</h2>
      <p>Every figure on this page is either a published fact with a named source, or one of our own named assumptions. The sums are plain arithmetic, done by the same engine as the simulator. No AI wrote any number.</p>
      <p className="guide-small">{plan.selling_note}</p>

      <h3>The facts we used</h3>
      <table className="guide-table guide-table-facts">
        <caption className="visually-hidden">Facts used, with sources and dates</caption>
        <thead><tr><th scope="col">Fact</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">Link last checked</th></tr></thead>
        <tbody>
          {plan.facts_used.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.label}</th>
              <td data-label="Value">{lineValue(f)} <Basis line={f} /></td>
              <td data-label="Source">{f.source && <SourceLink source={f.source} />}</td>
              <td data-label="Checked">{dateText(f.source?.last_checked)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>The assumptions we made</h3>
      <ul className="guide-assumptions">
        {plan.assumptions.map((a) => (
          <li key={a.id}><strong>{a.label}</strong>{a.low !== null && a.high !== null && <>: {lineValue({ low: a.low, high: a.high, unit: a.unit, currency: null })}</>}. {a.rationale}</li>
        ))}
      </ul>

      <h3>What we could not find</h3>
      <ul>{plan.gaps.map((g) => <li key={g.id}>{g.text}</li>)}</ul>

      <p className="guide-small">{NOT_AFFILIATED} Links may change; last checked {dateText(checked)}. Data dated {plan.data_version.split(".")[0]}.</p>
    </section>
  );
}
