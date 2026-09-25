import { useRef } from "react";
import { useGridNavigation } from "../hooks/useGridNavigation.js";

function abstentionPct(a, b) {
  const av = parseFloat(String(a).replace(",", ".")) || 0;
  const bv = parseFloat(String(b).replace(",", ".")) || 0;
  return 100 - av - bv;
}

export default function TransfersTable({ simulation, onFieldChange, onAbstentionFieldChange }) {
  const tableRef = useRef(null);
  useGridNavigation(tableRef);

  const hasFinalists = simulation.has_finalists;
  const finalistAName = simulation.finalist_a?.name;
  const finalistBName = simulation.finalist_b?.name;
  const abstStayPct = abstentionPct(simulation.abstention_to_a, simulation.abstention_to_b);

  return (
    <div className="panel">
      <h2>Reports de voix vers le 2e tour</h2>
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
            <td>Abstentionnistes 1er tour</td>
            <td>
              <input
                type="text"
                inputMode="decimal"
                className="grid-input"
                value={simulation.abstention_to_a}
                onChange={(e) => onAbstentionFieldChange("pct_to_a", e.target.value)}
              />
            </td>
            <td>
              <input
                type="text"
                inputMode="decimal"
                className="grid-input"
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
            return (
              <tr key={c.id}>
                <td className="candidate-name-cell">{c.name}</td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="grid-input"
                    value={c.transfer.pct_to_a}
                    onChange={(e) => onFieldChange(c.id, "pct_to_a", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="grid-input"
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
