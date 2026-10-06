import { useRef } from "react";
import { useGridNavigation } from "../hooks/useGridNavigation.js";
import { describeTransferSource } from "../utils/transferHypothesis.js";
import Candidate, { Abstention } from "./Candidate.jsx";

function abstentionPct(a, b) {
  const av = parseFloat(String(a).replace(",", ".")) || 0;
  const bv = parseFloat(String(b).replace(",", ".")) || 0;
  return 100 - av - bv;
}

function diffProps(value, expected) {
  if (expected == null) return { className: "grid-input" };
  const current = parseFloat(String(value).replace(",", ".")) || 0;
  return current === expected
    ? { className: "grid-input" }
    : { className: "grid-input assumption-diff", title: `Valeur de l'hypothèse : ${expected}%` };
}

export default function TransfersTable({
  simulation,
  onFieldChange,
  onAbstentionFieldChange,
  headerActions,
  headerTags,
  baseline,
  notice,
  onEditHypothesis,
}) {
  const tableRef = useRef(null);
  useGridNavigation(tableRef);

  const hasFinalists = simulation.has_finalists;
  const finalistAName = simulation.finalist_a?.name;
  const finalistBName = simulation.finalist_b?.name;
  const abstStayPct = abstentionPct(simulation.abstention_to_a, simulation.abstention_to_b);
  const uncovered = baseline
    ? simulation.candidates.filter((candidate) => baseline.rows.get(candidate.id)?.source === "none")
    : [];

  return (
    <div className="panel">
      <div className="panel-heading-row">
        <h2>Reports de voix vers le 2e tour</h2>
        {hasFinalists && headerActions && <div className="candidate-table-actions">{headerActions}</div>}
      </div>
      {headerTags}
      {notice}
      {uncovered.length > 0 && (
        <p className="transfer-uncovered-banner" role="status">
          <strong>{uncovered.length} ligne{uncovered.length > 1 ? "s" : ""} non couverte{uncovered.length > 1 ? "s" : ""} par l'hypothèse</strong>
          {" "}({uncovered.map((candidate) => candidate.name).join(", ")}) : leurs voix sont reportées vers l'abstention par défaut.
          {onEditHypothesis && (
            <>
              {" "}
              <button type="button" className="link-button" onClick={onEditHypothesis}>Compléter l'hypothèse</button>
            </>
          )}
        </p>
      )}
      {hasFinalists ? (
        <p className="hint">
          Finalistes : <strong>{finalistAName}</strong> et <strong>{finalistBName}</strong> (les 2 candidats
          ayant le plus de voix au 1er tour). Répartissez les voix de chaque candidat et des abstentionnistes
          entre les 2 finalistes ; l'abstention au 2e tour se calcule automatiquement.
        </p>
      ) : (
        <p className="hint">Ajoutez au moins 2 candidats pour configurer les reports de voix.</p>
      )}

      <table className="data-table grid-table" ref={tableRef} hidden={!hasFinalists}>
        <thead>
          <tr>
            <th>Origine (1er tour)</th>
            <th>% vers {finalistAName}</th>
            <th>% vers {finalistBName}</th>
            <th>% Abstention (auto)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="abstention-row">
            <td><Abstention><span className="candidate-name">Abstentionnistes 1er tour</span></Abstention></td>
            <td>
              <input
                type="text"
                inputMode="decimal"
                {...diffProps(simulation.abstention_to_a, baseline?.abstention.pct_to_a)}
                value={simulation.abstention_to_a}
                onChange={(e) => onAbstentionFieldChange("pct_to_a", e.target.value)}
              />
            </td>
            <td>
              <input
                type="text"
                inputMode="decimal"
                {...diffProps(simulation.abstention_to_b, baseline?.abstention.pct_to_b)}
                value={simulation.abstention_to_b}
                onChange={(e) => onAbstentionFieldChange("pct_to_b", e.target.value)}
              />
            </td>
            <td className={`abstention-auto ${abstStayPct < 0 ? "cell-negative" : ""}`}>
              {abstStayPct.toFixed(2)}%
            </td>
          </tr>
          {simulation.candidates.map((c) => {
            const pct = abstentionPct(c.transfer.pct_to_a, c.transfer.pct_to_b);
            const expected = baseline?.rows.get(c.id);
            return (
              <tr key={c.id} className={expected?.source === "none" ? "transfer-uncovered" : ""}>
                <td className="candidate-name-cell">
                  <Candidate name={c.name} />
                  {expected && <span className="transfer-source">{describeTransferSource(expected)}</span>}
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    {...diffProps(c.transfer.pct_to_a, expected?.pct_to_a)}
                    value={c.transfer.pct_to_a}
                    onChange={(e) => onFieldChange(c.id, "pct_to_a", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    {...diffProps(c.transfer.pct_to_b, expected?.pct_to_b)}
                    value={c.transfer.pct_to_b}
                    onChange={(e) => onFieldChange(c.id, "pct_to_b", e.target.value)}
                  />
                </td>
                <td className={`abstention-auto ${pct < 0 ? "cell-negative" : ""}`}>{pct.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
