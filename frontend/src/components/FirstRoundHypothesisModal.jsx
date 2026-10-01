import { useCallback } from "react";
import { api } from "../api.js";
import HypothesisPickerModal from "./HypothesisPickerModal.jsx";

function getLeaders(hypothesis) {
  return [...hypothesis.candidates]
    .sort((a, b) => Number(b.pct_r1) - Number(a.pct_r1))
    .slice(0, 2);
}

function renderSummary(hypothesis) {
  const topCandidates = getLeaders(hypothesis);
  return topCandidates.length === 2
    ? `${topCandidates[0].name} ${topCandidates[0].pct_r1}% · ${topCandidates[1].name} ${topCandidates[1].pct_r1}%`
    : "—";
}

function renderDetail(hypothesis) {
  const leaders = getLeaders(hypothesis);
  return (
    <>
      {leaders.length === 2 && (
        <p className="hypothesis-picker-leaders">
          En tête : <strong>{leaders[0].name}</strong> ({leaders[0].pct_r1}%) · <strong>{leaders[1].name}</strong> ({leaders[1].pct_r1}%)
        </p>
      )}
      {hypothesis.candidates.length ? (
        <table className="data-table hypothesis-readonly-table">
          <thead><tr><th>Candidat</th><th>% 1er tour</th></tr></thead>
          <tbody>
            {hypothesis.candidates.map((candidate) => (
              <tr key={candidate.id}>
                <td>{candidate.name}</td>
                <td>{candidate.pct_r1}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint">Cette hypothèse ne contient aucun candidat.</p>
      )}
    </>
  );
}

export default function FirstRoundHypothesisModal({ electionId, selectedHypothesisId, onSelect, onClose }) {
  const loadHypotheses = useCallback(() => api.listElectionHypotheses(electionId), [electionId]);
  const loadHypothesis = useCallback((id) => api.getElectionHypothesis(electionId, id), [electionId]);
  const loadTags = useCallback(() => api.listElectionTags(electionId), [electionId]);

  return (
    <HypothesisPickerModal
      eyebrow="Premier tour"
      listLabel="Hypothèses premier tour"
      loadHypotheses={loadHypotheses}
      loadHypothesis={loadHypothesis}
      loadTags={loadTags}
      renderSummary={renderSummary}
      renderDetail={renderDetail}
      selectedHypothesisId={selectedHypothesisId}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

