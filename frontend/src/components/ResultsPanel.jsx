export default function ResultsPanel({ simulation }) {
  if (!simulation.has_finalists) {
    return (
      <p className="empty">
        Le diagramme de Sankey et les résultats du 2e tour apparaîtront ici dès que 2 candidats au moins seront
        configurés.
      </p>
    );
  }

  const winnerIsA = simulation.winner_id === simulation.finalist_a.id;
  const winnerName = winnerIsA ? simulation.finalist_a.name : simulation.finalist_b.name;

  return (
    <>
      <table className="data-table results-table">
        <thead>
          <tr>
            <th>Candidat</th>
            <th>Voix</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          <tr className={winnerIsA ? "winner" : ""}>
            <td>{simulation.finalist_a.name}</td>
            <td>{simulation.votes_a}</td>
            <td>{simulation.pct_a.toFixed(2)}%</td>
          </tr>
          <tr className={!winnerIsA ? "winner" : ""}>
            <td>{simulation.finalist_b.name}</td>
            <td>{simulation.votes_b}</td>
            <td>{simulation.pct_b.toFixed(2)}%</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        Abstention au 2e tour : <strong>{simulation.abstention_r2}</strong> &nbsp;|&nbsp; Participation :{" "}
        <strong>{simulation.participation_r2}</strong>
      </p>
      <p className="winner-banner">
        🏆 Vainqueur estimé : <strong>{winnerName}</strong>
      </p>
    </>
  );
}
