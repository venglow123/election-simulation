// Calcul du 2e tour et des données du Sankey à partir d'une simulation brute (état persisté).

const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
];
const TOLERANCE = 0.01;

const round2 = (value) => Math.round(value * 100) / 100;
// Équivalent du format Python `:g` (6 chiffres significatifs, sans zéros inutiles).
const formatG = (value) => String(Number(value.toPrecision(6)));

export function votantsR1(simulation) {
  return Math.max(simulation.total_inscrits - simulation.abstention_r1, 0);
}

export function candidateVotesR1(simulation, candidate) {
  return Math.round((votantsR1(simulation) * candidate.pct_r1) / 100);
}

export function pctToAbstention(transfer) {
  return 100 - transfer.pct_to_a - transfer.pct_to_b;
}

export function getFinalists(simulation) {
  return [...simulation.candidates].sort((a, b) => b.pct_r1 - a.pct_r1).slice(0, 2);
}

export function computeResults(simulation) {
  const candidates = simulation.candidates;
  const result = { has_finalists: false, warnings: [] };

  const totalPctR1 = candidates.reduce((sum, c) => sum + c.pct_r1, 0);
  if (candidates.length && Math.abs(totalPctR1 - 100) > TOLERANCE) {
    result.warnings.push(
      `La somme des pourcentages du 1er tour est de ${totalPctR1.toFixed(2)}% (attendu 100%).`
    );
  }

  for (const candidate of candidates) {
    const totalRow = candidate.transfer.pct_to_a + candidate.transfer.pct_to_b;
    if (totalRow > 100 + TOLERANCE) {
      result.warnings.push(
        `Report de « ${candidate.name} » : ${totalRow.toFixed(2)}% répartis vers les finalistes (max 100%).`
      );
    }
  }

  const abstTotal = simulation.abstention_to_a + simulation.abstention_to_b;
  if (abstTotal > 100 + TOLERANCE) {
    result.warnings.push(
      `Report des abstentionnistes du 1er tour : ${abstTotal.toFixed(2)}% répartis vers les finalistes (max 100%).`
    );
  }

  const finalists = getFinalists(simulation);
  if (finalists.length < 2) return result;

  const [finalistA, finalistB] = finalists;
  let votesA = 0;
  let votesB = 0;
  let abstentionFromTransfers = 0;
  const breakdown = [];

  for (const candidate of candidates) {
    const { transfer } = candidate;
    const vR1 = candidateVotesR1(simulation, candidate);
    const vA = (vR1 * transfer.pct_to_a) / 100;
    const vB = (vR1 * transfer.pct_to_b) / 100;
    const vAbs = (vR1 * pctToAbstention(transfer)) / 100;
    votesA += vA;
    votesB += vB;
    abstentionFromTransfers += vAbs;
    breakdown.push({
      candidate,
      votes_r1: vR1,
      to_a: Math.round(vA),
      to_b: Math.round(vB),
      to_abstention: Math.round(vAbs),
    });
  }

  // Les abstentionnistes du 1er tour peuvent eux aussi voter au 2e tour.
  const abstentionR1 = simulation.abstention_r1;
  const abstToA = (abstentionR1 * simulation.abstention_to_a) / 100;
  const abstToB = (abstentionR1 * simulation.abstention_to_b) / 100;
  const abstStay = (abstentionR1 * (100 - simulation.abstention_to_a - simulation.abstention_to_b)) / 100;

  votesA = Math.round(votesA + abstToA);
  votesB = Math.round(votesB + abstToB);
  const abstentionR2 = Math.round(abstentionFromTransfers) + Math.round(abstStay);
  const totalVotesR2 = votesA + votesB;

  Object.assign(result, {
    has_finalists: true,
    finalist_a: finalistA,
    finalist_b: finalistB,
    votes_a: votesA,
    votes_b: votesB,
    pct_a: totalVotesR2 ? (votesA / totalVotesR2) * 100 : 0,
    pct_b: totalVotesR2 ? (votesB / totalVotesR2) * 100 : 0,
    abstention_r2: abstentionR2,
    participation_r2: simulation.total_inscrits - abstentionR2,
    winner: votesA >= votesB ? finalistA : finalistB,
    breakdown,
    abst_to_a: Math.round(abstToA),
    abst_to_b: Math.round(abstToB),
    abst_stay: Math.round(Math.max(abstStay, 0)),
  });
  return result;
}

export function buildSankeyData(simulation, results) {
  if (!results.has_finalists) return null;

  const nodesLeft = simulation.candidates.map((candidate, index) => ({
    id: `c${candidate.id}`,
    label: `${candidate.name} (${formatG(candidate.pct_r1)}%)`,
    value: candidateVotesR1(simulation, candidate),
    color: PALETTE[index % PALETTE.length],
  }));
  nodesLeft.push({ id: "abst1", label: "Abstention 1er tour", value: simulation.abstention_r1, color: "#999999" });

  const nodesRight = [
    { id: "fa", label: `${results.finalist_a.name} (2e tour)`, value: results.votes_a, color: "#333333" },
    { id: "fb", label: `${results.finalist_b.name} (2e tour)`, value: results.votes_b, color: "#333333" },
    { id: "abst2", label: "Abstention 2e tour", value: results.abstention_r2, color: "#999999" },
  ];

  const links = [];
  const addLink = (source, target, value) => {
    if (value > 0) links.push({ source, target, value });
  };
  for (const item of results.breakdown) {
    const source = `c${item.candidate.id}`;
    addLink(source, "fa", item.to_a);
    addLink(source, "fb", item.to_b);
    addLink(source, "abst2", item.to_abstention);
  }
  addLink("abst1", "fa", results.abst_to_a);
  addLink("abst1", "fb", results.abst_to_b);
  addLink("abst1", "abst2", results.abst_stay);

  return { nodesLeft, nodesRight, links };
}

// Représentation complète consommée par les composants React (champs éditables + valeurs calculées).
export function serializeSimulation(simulation) {
  const results = computeResults(simulation);

  const payload = {
    id: simulation.id,
    name: simulation.name,
    description: simulation.description,
    position: simulation.position,
    total_inscrits: simulation.total_inscrits,
    abstention_r1: simulation.abstention_r1,
    votants_r1: votantsR1(simulation),
    abstention_to_a: simulation.abstention_to_a,
    abstention_to_b: simulation.abstention_to_b,
    r1_hypothesis_id: simulation.r1_hypothesis_id ?? null,
    abstention_stay_pct: round2(100 - simulation.abstention_to_a - simulation.abstention_to_b),
    candidates: simulation.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      pct_r1: c.pct_r1,
      hypothesis_candidate_id: c.hypothesis_candidate_id ?? null,
      r1_name_override: Boolean(c.r1_name_override),
      r1_pct_override: Boolean(c.r1_pct_override),
      votes_r1: candidateVotesR1(simulation, c),
      transfer: {
        pct_to_a: c.transfer.pct_to_a,
        pct_to_b: c.transfer.pct_to_b,
        pct_to_abstention: round2(pctToAbstention(c.transfer)),
      },
    })),
    warnings: results.warnings,
    has_finalists: results.has_finalists,
    finalist_a: null,
    finalist_b: null,
    votes_a: null,
    votes_b: null,
    pct_a: null,
    pct_b: null,
    abstention_r2: null,
    participation_r2: null,
    winner_id: null,
    sankey: buildSankeyData(simulation, results),
  };

  if (results.has_finalists) {
    Object.assign(payload, {
      finalist_a: { id: results.finalist_a.id, name: results.finalist_a.name },
      finalist_b: { id: results.finalist_b.id, name: results.finalist_b.name },
      votes_a: results.votes_a,
      votes_b: results.votes_b,
      pct_a: round2(results.pct_a),
      pct_b: round2(results.pct_b),
      abstention_r2: results.abstention_r2,
      participation_r2: results.participation_r2,
      winner_id: results.winner.id,
    });
  }

  return payload;
}
