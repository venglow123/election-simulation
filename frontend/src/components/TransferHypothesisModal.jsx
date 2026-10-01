import { useCallback, useMemo } from "react";
import { api } from "../api.js";
import { buildPartyIndex, computeTransferBaseline, describeTransferSource, transferConditionMatches } from "../utils/transferHypothesis.js";
import HypothesisPickerModal from "./HypothesisPickerModal.jsx";

function formatPct(value) {
  return `${Number(value.toFixed(2))}%`;
}

export default function TransferHypothesisModal({
  electionId,
  simulation,
  candidateOptions,
  selectedHypothesisId,
  onSelect,
  onClose,
}) {
  const finalistA = simulation.finalist_a?.name;
  const finalistB = simulation.finalist_b?.name;
  const partyByName = useMemo(() => buildPartyIndex(candidateOptions), [candidateOptions]);

  const loadHypotheses = useCallback(() => api.listElectionTransferHypotheses(electionId), [electionId]);
  const loadHypothesis = useCallback((id) => api.getElectionTransferHypothesis(electionId, id), [electionId]);
  const loadTags = useCallback(() => api.listElectionTags(electionId), [electionId]);
  const isAvailable = useCallback(
    (hypothesis) => transferConditionMatches(hypothesis, [finalistA, finalistB]),
    [finalistA, finalistB]
  );
  const baselineOf = useCallback((hypothesis) => computeTransferBaseline(hypothesis, {
    finalistA,
    finalistB,
    candidates: simulation.candidates,
    partyByName,
  }), [finalistA, finalistB, simulation.candidates, partyByName]);

  function renderSummary(hypothesis) {
    const baseline = baselineOf(hypothesis);
    const uncovered = baseline ? [...baseline.rows.values()].filter((row) => row.source === "none").length : 0;
    const rows = `${hypothesis.candidate_transfers.length} cand. · ${hypothesis.party_transfers.length} parti${hypothesis.party_transfers.length > 1 ? "s" : ""}`;
    return uncovered
      ? <>{rows} · <span className="transfer-uncovered-count">{uncovered} ligne{uncovered > 1 ? "s" : ""} non couverte{uncovered > 1 ? "s" : ""}</span></>
      : `${rows} · tout est couvert`;
  }

  function renderDetail(hypothesis) {
    const baseline = baselineOf(hypothesis);
    if (!baseline) return <p className="hint">Cette hypothèse ne correspond pas aux finalistes du scénario.</p>;
    const abstention = baseline.abstention;
    return (
      <>
        <p className="hypothesis-picker-leaders">
          Aperçu des reports appliqués à ce scénario (candidats prioritaires sur les partis ; lignes non couvertes : 100 % abstention).
        </p>
        <table className="data-table hypothesis-readonly-table">
          <thead>
            <tr>
              <th>Origine</th>
              <th>Source</th>
              <th>% vers {finalistA}</th>
              <th>% vers {finalistB}</th>
              <th>% Abstention</th>
            </tr>
          </thead>
          <tbody>
            <tr className="abstention-row">
              <td>Abstentionnistes 1er tour</td>
              <td>Hypothèse</td>
              <td>{formatPct(abstention.pct_to_a)}</td>
              <td>{formatPct(abstention.pct_to_b)}</td>
              <td>{formatPct(100 - abstention.pct_to_a - abstention.pct_to_b)}</td>
            </tr>
            {simulation.candidates.map((candidate) => {
              const row = baseline.rows.get(candidate.id);
              return (
                <tr key={candidate.id} className={row.source === "none" ? "transfer-uncovered" : ""}>
                  <td>{candidate.name}</td>
                  <td className="transfer-source-cell">{describeTransferSource(row)}</td>
                  <td>{formatPct(row.pct_to_a)}</td>
                  <td>{formatPct(row.pct_to_b)}</td>
                  <td>{formatPct(100 - row.pct_to_a - row.pct_to_b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }

  function renderNotice(all, available) {
    const hidden = all.length - available.length;
    return (
      <p className="hint">
        Duel du scénario : <strong>{finalistA}</strong> / <strong>{finalistB}</strong>.
        {hidden > 0 && ` ${hidden} hypothèse${hidden > 1 ? "s" : ""} définie${hidden > 1 ? "s" : ""} pour un autre duel ${hidden > 1 ? "sont masquées" : "est masquée"}.`}
      </p>
    );
  }

  return (
    <HypothesisPickerModal
      eyebrow="Reports de voix"
      listLabel="Hypothèses de report"
      loadHypotheses={loadHypotheses}
      loadHypothesis={loadHypothesis}
      loadTags={loadTags}
      isAvailable={isAvailable}
      renderSummary={renderSummary}
      renderDetail={renderDetail}
      notice={renderNotice}
      emptyMessage="Aucune hypothèse de report ne correspond à ce duel. Vous pouvez continuer en Custom ou enregistrer les reports actuels comme hypothèse."
      selectedHypothesisId={selectedHypothesisId}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
