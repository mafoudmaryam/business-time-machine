import type { SimulationRunOut } from "../../api";

/** Small reproducibility footer: engine_version, seed and iterations, per golden rule 4. */
export function RunMeta({ run }: { run: SimulationRunOut }) {
  return (
    <p className="run-meta">
      Run #{run.id} · engine {run.engine_version} · seed {run.seed} · {run.iterations.toLocaleString()} iterations ·{" "}
      {run.horizon}-month horizon
    </p>
  );
}
