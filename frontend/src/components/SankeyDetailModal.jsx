import { useEffect, useMemo } from "react";
import SankeyDiagram from "./SankeyDiagram.jsx";

const DESTINATION_IDS = ["fa", "fb", "abst2"];

function formatFlow(value, total) {
  if (!value) return "—";
  const percentage = total ? Math.round((value / total) * 100) : 0;
  return `${Math.round(value)} (${percentage}%)`;
}

export default function SankeyDetailModal({ data, onClose }) {
  const destinations = useMemo(
    () =>
      DESTINATION_IDS.map((id) => ({
        id,
        label: data.nodesRight.find((node) => node.id === id)?.label || id,
      })),
    [data]
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const linksBySource = data.links.reduce((bySource, link) => {
      bySource[link.source] = bySource[link.source] || {};
      bySource[link.source][link.target] = link.value;
      return bySource;
    }, {});

    return data.nodesLeft.map((source) => ({
      ...source,
      flows: linksBySource[source.id] || {},
    }));
  }, [data]);

  const totals = useMemo(() => {
    const totalOrigin = data.nodesLeft.reduce((sum, node) => sum + node.value, 0);
    const byTarget = Object.fromEntries(data.nodesRight.map((node) => [node.id, node.value]));
    return { totalOrigin, byTarget };
  }, [data]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!data) return null;

  return (
    <div className="detail-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sankey-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="detail-dialog-header">
          <div>
            <p className="detail-eyebrow">Lecture détaillée</p>
            <h2 id="sankey-detail-title">Flux de voix entre les deux tours</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer le détail">
            ×
          </button>
        </header>

        <div className="detail-dialog-body">
          <div className="detail-sankey-wrap">
            <SankeyDiagram data={data} />
          </div>

          <div className="flow-table-heading">
            <div>
              <h3>Détail des reports</h3>
              <p className="hint">Volumes de voix, puis part du total de chaque origine.</p>
            </div>
            <span className="flow-table-legend">Voix (%)</span>
          </div>
          <div className="detail-table-scroll">
            <table className="data-table flow-detail-table">
              <thead>
                <tr>
                  <th>Origine au 1er tour</th>
                  {destinations.map((destination) => (
                    <th key={destination.id}>{destination.label}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="flow-source-cell">
                      <span className="flow-color" style={{ backgroundColor: row.color || "#555555" }} />
                      {row.label}
                    </td>
                    {destinations.map((destination) => (
                      <td key={destination.id}>{formatFlow(row.flows[destination.id], row.value)}</td>
                    ))}
                    <td className="flow-total-cell">{Math.round(row.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="flow-total-label">Total final</td>
                  {destinations.map((destination) => (
                    <td key={destination.id} className="flow-total-cell">
                      {formatFlow(totals.byTarget[destination.id], totals.totalOrigin)}
                    </td>
                  ))}
                  <td className="flow-total-cell">{Math.round(totals.totalOrigin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
