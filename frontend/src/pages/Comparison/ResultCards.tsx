import type { ScenarioResultOut } from "../../api";
import { InfoTip } from "../../components/InfoTip";
import { SCENARIO_COLORS } from "../../constants";
import { formatMoney } from "../../lib/format";
import { chanceOutOf10, signed } from "../../lib/formatChance";
import { displayScenarioName } from "../../lib/scenarioLabel";

interface Props {
  results: ScenarioResultOut[];
  currency: string;
}

/** One card per scenario with the three numbers an owner asks first: how much profit,
 * how does it compare with changing nothing, and how sure is that. Every number is
 * read straight from the engine's summary -- nothing is recalculated here. */
export function ResultCards({ results, currency }: Props) {
  const money = (v: number) => formatMoney(v, currency);
  // Which scenario has the highest most-likely profit? (Just picking the largest
  // engine number, so the owner's eye knows where to look first.)
  const best = results.slice(1).reduce<ScenarioResultOut | null>(
    (top, r) => (!top || r.summary.total_profit_p50 > top.summary.total_profit_p50 ? r : top),
    null,
  );

  return (
    <ul className="result-cards" aria-label="Results at a glance">
      {results.map((r, i) => {
        const s = r.summary;
        const isBaseline = i === 0;
        const isBest = r === best && (s.profit_vs_baseline_p50 ?? 0) > 0;
        return (
          <li
            key={r.scenario_name}
            className={isBaseline ? "result-card is-baseline" : "result-card"}
            style={{ borderTopColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }}
          >
            {isBest && <span className="badge">Highest profit</span>}
            <h3>{displayScenarioName(r.scenario_name)}</h3>

            <p className="result-label">
              Total profit, most likely{" "}
              <InfoTip text="The middle outcome of 1,000 simulated futures: half did better, half did worse." />
            </p>
            <p className="result-big">{money(s.total_profit_p50)}</p>
            <p className="result-range">
              Could be {money(s.total_profit_p10)} to {money(s.total_profit_p90)}
            </p>

            {!isBaseline && s.profit_vs_baseline_p50 !== undefined && (
              <p
                className={
                  s.profit_vs_baseline_p50 >= 0 ? "result-delta is-up" : "result-delta is-down"
                }
              >
                {signed(s.profit_vs_baseline_p50, money)} vs. changing nothing
              </p>
            )}

            <dl className="result-facts">
              {!isBaseline && s.prob_beats_baseline_profit !== undefined && (
                <div>
                  <dt>Better than changing nothing</dt>
                  <dd>in {chanceOutOf10(s.prob_beats_baseline_profit)}</dd>
                </div>
              )}
              <div>
                <dt>Cash runs out</dt>
                <dd className={s.prob_cash_negative > 0 ? "is-warning" : undefined}>
                  in {chanceOutOf10(s.prob_cash_negative)}
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
