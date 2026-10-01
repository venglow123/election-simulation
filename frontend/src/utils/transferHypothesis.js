import { normalizeTagName as normalizeKey } from "./tags.js";

export { normalizeKey };

export function transferConditionMatches(hypothesis, finalistNames) {
  const a = normalizeKey(hypothesis?.finalist_a);
  const b = normalizeKey(hypothesis?.finalist_b);
  if (!a || !b || !Array.isArray(finalistNames) || finalistNames.length !== 2) return false;
  const [x, y] = finalistNames.map(normalizeKey);
  return (a === x && b === y) || (a === y && b === x);
}

export function buildPartyIndex(electionCandidates) {
  return new Map((electionCandidates || [])
    .filter((candidate) => String(candidate.party || "").trim())
    .map((candidate) => [normalizeKey(candidate.name), String(candidate.party).trim()]));
}

// Résout, pour chaque ligne du scénario, le report issu de l'hypothèse :
// matrice candidats prioritaire, puis matrice partis, sinon 100 % abstention.
export function computeTransferBaseline(hypothesis, { finalistA, finalistB, candidates, partyByName }) {
  if (!transferConditionMatches(hypothesis, [finalistA, finalistB])) return null;
  // Les colonnes A/B de l'hypothèse suivent son propre ordre, pas celui du scénario.
  const swapped = normalizeKey(hypothesis.finalist_a) !== normalizeKey(finalistA);
  const orient = (row) => {
    const pctA = Number(row.pct_to_a) || 0;
    const pctB = Number(row.pct_to_b) || 0;
    return swapped ? { pct_to_a: pctB, pct_to_b: pctA } : { pct_to_a: pctA, pct_to_b: pctB };
  };
  const byCandidate = new Map((hypothesis.candidate_transfers || []).map((row) => [normalizeKey(row.name), row]));
  const byParty = new Map((hypothesis.party_transfers || []).map((row) => [normalizeKey(row.party), row]));
  const rows = new Map();
  for (const candidate of candidates) {
    const candidateRow = byCandidate.get(normalizeKey(candidate.name));
    if (candidateRow) {
      rows.set(candidate.id, { ...orient(candidateRow), source: "candidate" });
      continue;
    }
    const party = partyByName.get(normalizeKey(candidate.name)) || "";
    const partyRow = party ? byParty.get(normalizeKey(party)) : null;
    if (partyRow) {
      rows.set(candidate.id, { ...orient(partyRow), source: "party", party: partyRow.party });
      continue;
    }
    rows.set(candidate.id, { pct_to_a: 0, pct_to_b: 0, source: "none", party });
  }
  return {
    abstention: orient({ pct_to_a: hypothesis.abstention_to_a, pct_to_b: hypothesis.abstention_to_b }),
    rows,
  };
}

export function describeTransferSource(row) {
  if (row.source === "candidate") return "Report du candidat";
  if (row.source === "party") return `Report du parti ${row.party}`;
  return row.party ? `Non couvert (parti ${row.party})` : "Non couvert";
}

export function describeTransferCondition(hypothesis) {
  return hypothesis.finalist_a && hypothesis.finalist_b
    ? `${hypothesis.finalist_a} / ${hypothesis.finalist_b}`
    : "Condition non définie";
}

export function summarizeTransferHypothesis(hypothesis) {
  const candidates = hypothesis.candidate_transfers.length;
  const parties = hypothesis.party_transfers.length;
  return `${describeTransferCondition(hypothesis)} · ${candidates} candidat${candidates > 1 ? "s" : ""} · ${parties} parti${parties > 1 ? "s" : ""}`;
}
