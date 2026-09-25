import { useRef, useState } from "react";
import { useGridNavigation } from "../hooks/useGridNavigation.js";

export default function CandidatesTable({ simulation, onFieldChange, onCreate, onDelete }) {
  const tableRef = useRef(null);
  const [draft, setDraft] = useState({ name: "", pct_r1: "" });

  useGridNavigation(tableRef, { onEnterLastRow: () => submitDraft() });

  function submitDraft() {
    const name = draft.name.trim();
    if (!name) return;
    onCreate({ name, pct_r1: draft.pct_r1 || 0 }).then(() => setDraft({ name: "", pct_r1: "" }));
  }

  const totalPct = simulation.candidates.reduce(
    (sum, c) => sum + (parseFloat(String(c.pct_r1).replace(",", ".")) || 0),
    0
  );

  return (
    <div className="panel">
      <h2>Résultats du 1er tour</h2>
      <table className="data-table grid-table" ref={tableRef}>
        <thead>
          <tr>
            <th>Candidat</th>
            <th>% 1er tour</th>
            <th>Voix</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {simulation.candidates.map((c) => (
            <tr key={c.id}>
              <td>
                <input
                  type="text"
                  className="grid-input"
                  value={c.name}
                  onChange={(e) => onFieldChange(c.id, "name", e.target.value)}
                />
              </td>
              <td>
                <input
                  type="text"
                  inputMode="decimal"
                  className="grid-input"
                  value={c.pct_r1}
                  onChange={(e) => onFieldChange(c.id, "pct_r1", e.target.value)}
                />
              </td>
              <td className="votes-cell">{c.votes_r1}</td>
              <td>
                <button
                  type="button"
                  className="danger row-delete"
                  title="Supprimer"
                  onClick={() => {
                    if (confirm(`Supprimer « ${c.name} » ?`)) onDelete(c.id);
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          <tr className="new-row">
            <td>
              <input
                type="text"
                className="grid-input"
                placeholder="Ajouter un candidat…"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </td>
            <td>
              <input
                type="text"
                inputMode="decimal"
                className="grid-input"
                placeholder="0"
                value={draft.pct_r1}
                onChange={(e) => setDraft((d) => ({ ...d, pct_r1: e.target.value }))}
              />
            </td>
            <td className="votes-cell">—</td>
            <td></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className={`total-cell ${Math.abs(totalPct - 100) <= 0.01 ? "total-ok" : "total-warn"}`}>
              {totalPct.toFixed(2)}%
            </td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
      <p className="hint">
        Cliquez dans une cellule vide en bas du tableau pour ajouter un candidat. Naviguez avec les flèches
        ↑↓←→ ou <kbd>Tab</kbd>, validez une ligne avec <kbd>Entrée</kbd>. Tout est enregistré automatiquement.
      </p>
    </div>
  );
}
