import { getFinalists, serializeSimulation } from "../utils/simulationEngine.js";
import { buildPartyIndex, computeTransferBaseline } from "../utils/transferHypothesis.js";
import { loadState, saveState } from "./storage.js";

export function toFloat(value, fallback = 0) {
  const parsed = Number(String(value).replace(",", "."));
  return value === null || value === "" || !Number.isFinite(parsed) ? fallback : parsed;
}

export function toInt(value, fallback = 0) {
  return Math.trunc(toFloat(value, fallback));
}

export function findSimulation(state, id) {
  const simulation = state.simulations.find((s) => s.id === Number(id));
  if (!simulation) throw new Error("Scénario introuvable.");
  return simulation;
}

export function findCandidate(simulation, candidateId) {
  const candidate = simulation.candidates.find((c) => c.id === Number(candidateId));
  if (!candidate) throw new Error("Candidat introuvable.");
  return candidate;
}

export function findHypothesis(election, hypothesisId) {
  const hypothesis = election.hypotheses.find((item) => item.id === Number(hypothesisId));
  if (!hypothesis) throw new Error("Hypothèse introuvable.");
  return hypothesis;
}

export function findHypothesisCandidate(hypothesis, candidateId) {
  const candidate = hypothesis.candidates.find((item) => item.id === Number(candidateId));
  if (!candidate) throw new Error("Candidat introuvable.");
  return candidate;
}

export function findTransferHypothesis(election, hypothesisId) {
  const hypothesis = election.transfer_hypotheses.find((item) => item.id === Number(hypothesisId));
  if (!hypothesis) throw new Error("Hypothèse de report introuvable.");
  return hypothesis;
}

export function nextPosition(state, electionId) {
  return state.simulations
    .filter((simulation) => simulation.election_id === electionId)
    .reduce((max, simulation) => Math.max(max, simulation.position), 0) + 1;
}

export function findElection(state, id) {
  const election = state.elections.find((item) => item.id === Number(id));
  if (!election) throw new Error("Élection introuvable.");
  return election;
}

export function ensureDefaultElection(state) {
  if (!state.elections.length) {
    state.elections.push({
      id: state.nextElectionId++,
      name: "Nouvelle élection",
      position: 1,
      candidates: [],
      hypotheses: [],
      transfer_hypotheses: [],
      tags: [],
    });
  }
  return state.elections[0];
}

export function registerElectionCandidate(state, electionId, name, party = "") {
  const election = findElection(state, electionId);
  const candidateName = String(name || "").trim();
  if (!candidateName) return;
  const existing = election.candidates.find((candidate) => candidate.name === candidateName);
  if (existing) {
    if (party && !existing.party) existing.party = party;
    return existing;
  }
  const candidate = { id: state.nextElectionCandidateId++, name: candidateName, party: String(party || "").trim() };
  election.candidates.push(candidate);
  return candidate;
}

export function getElectionCandidateUsageCount(state, election, name) {
  return state.simulations
    .filter((simulation) => simulation.election_id === election.id)
    .reduce((count, simulation) => count + simulation.candidates.filter((candidate) => candidate.name === name).length, 0)
    + election.hypotheses.reduce((count, hypothesis) => (
      count + hypothesis.candidates.filter((candidate) => candidate.name === name).length
    ), 0)
    + election.transfer_hypotheses.reduce((count, hypothesis) => (
      count
      + hypothesis.candidate_transfers.filter((candidate) => candidate.name === name).length
      + Number(hypothesis.finalist_a === name)
      + Number(hypothesis.finalist_b === name)
    ), 0);
}

export function removeUnusedElectionCandidate(state, election, name) {
  if (getElectionCandidateUsageCount(state, election, name) > 0) return;
  election.candidates = election.candidates.filter((candidate) => candidate.name !== name);
}

export function createSimulationRecord(state, electionId, fields) {
  const election = findElection(state, electionId);
  const simulation = {
    id: state.nextSimulationId++,
    election_id: election.id,
    name: "Nouvelle simulation",
    description: "",
    position: nextPosition(state, election.id),
    created_at: new Date().toISOString(),
    total_inscrits: 1000,
    abstention_r1: 0,
    abstention_to_a: 0,
    abstention_to_b: 0,
    r1_hypothesis_id: null,
    r1_tag_ids: [],
    r1_excluded_hypothesis_candidate_ids: [],
    r2_hypothesis_id: null,
    r2_tag_ids: [],
    candidates: [],
    ...fields,
  };
  state.simulations.push(simulation);
  return simulation;
}

export function createCandidateRecord(state, simulation, {
  name,
  pct_r1 = 0,
  pct_to_a = 0,
  pct_to_b = 0,
  hypothesis_candidate_id = null,
  r1_name_override = false,
  r1_pct_override = false,
}) {
  const candidate = {
    id: state.nextCandidateId++,
    name,
    pct_r1,
    transfer: { pct_to_a, pct_to_b },
    hypothesis_candidate_id,
    r1_name_override,
    r1_pct_override,
  };
  simulation.candidates.push(candidate);
  registerElectionCandidate(state, simulation.election_id, name);
  return candidate;
}

export function createHypothesisRecord(state, election, fields = {}) {
  const hypothesis = {
    id: state.nextHypothesisId++,
    name: "Nouvelle hypothèse",
    description: "",
    position: election.hypotheses.reduce((max, item) => Math.max(max, item.position), 0) + 1,
    candidates: [],
    tag_ids: [],
    ...fields,
  };
  election.hypotheses.push(hypothesis);
  return hypothesis;
}

export function createHypothesisCandidateRecord(state, electionId, hypothesis, { name, pct_r1 = 0 }) {
  const candidate = { id: state.nextHypothesisCandidateId++, name, pct_r1 };
  hypothesis.candidates.push(candidate);
  registerElectionCandidate(state, electionId, name);
  return candidate;
}

export function applyHypothesisToSimulation(state, election, simulation, hypothesis) {
  const existingByHypothesisCandidate = new Map(
    simulation.candidates
      .filter((candidate) => candidate.hypothesis_candidate_id != null)
      .map((candidate) => [candidate.hypothesis_candidate_id, candidate])
  );
  const existingByName = new Map(simulation.candidates.map((candidate) => [candidate.name, candidate]));
  simulation.candidates = hypothesis.candidates.map((source) => {
    const existing = existingByHypothesisCandidate.get(source.id) || existingByName.get(source.name);
    const candidate = existing || createCandidateRecord(state, simulation, {
      name: source.name,
      pct_r1: source.pct_r1,
      hypothesis_candidate_id: source.id,
    });
    candidate.name = source.name;
    candidate.pct_r1 = source.pct_r1;
    candidate.hypothesis_candidate_id = source.id;
    candidate.r1_name_override = false;
    candidate.r1_pct_override = false;
    registerElectionCandidate(state, election.id, source.name);
    return candidate;
  });
  simulation.r1_hypothesis_id = hypothesis.id;
  simulation.r1_excluded_hypothesis_candidate_ids = [];
}

export function detachHypothesisFromSimulation(simulation) {
  simulation.r1_hypothesis_id = null;
  simulation.r1_excluded_hypothesis_candidate_ids = [];
  simulation.candidates = simulation.candidates.map((candidate) => ({
    ...candidate,
    hypothesis_candidate_id: null,
    r1_name_override: false,
    r1_pct_override: false,
  }));
}

export function getSimulationPayload(simulation) {
  return { ...serializeSimulation(simulation), election_id: simulation.election_id };
}

export function createTransferHypothesisRecord(state, election, fields = {}) {
  const hypothesis = {
    id: state.nextTransferHypothesisId++,
    name: "Nouvelle hypothèse de report",
    description: "",
    position: election.transfer_hypotheses.reduce((max, item) => Math.max(max, item.position), 0) + 1,
    tag_ids: [],
    finalist_a: "",
    finalist_b: "",
    abstention_to_a: 0,
    abstention_to_b: 0,
    candidate_transfers: [],
    party_transfers: [],
    ...fields,
  };
  election.transfer_hypotheses.push(hypothesis);
  return hypothesis;
}

export const TRANSFER_ROW_KINDS = {
  candidate: { list: "candidate_transfers", key: "name", label: "candidat" },
  party: { list: "party_transfers", key: "party", label: "parti" },
};

export function createTransferRowRecord(state, hypothesis, kind, { key, pct_to_a = 0, pct_to_b = 0 }) {
  const { list, key: keyField } = TRANSFER_ROW_KINDS[kind];
  const row = { id: state.nextTransferRowId++, [keyField]: key, pct_to_a, pct_to_b };
  hypothesis[list].push(row);
  return row;
}

export function serializeTransferHypothesis(hypothesis) {
  return {
    ...hypothesis,
    tag_ids: [...hypothesis.tag_ids],
    candidate_transfers: hypothesis.candidate_transfers.map((row) => ({ ...row })),
    party_transfers: hypothesis.party_transfers.map((row) => ({ ...row })),
  };
}

export function computeSimulationTransferBaseline(election, simulation, hypothesis) {
  const finalists = getFinalists(simulation);
  if (finalists.length < 2) return null;
  return computeTransferBaseline(hypothesis, {
    finalistA: finalists[0].name,
    finalistB: finalists[1].name,
    candidates: simulation.candidates,
    partyByName: buildPartyIndex(election.candidates),
  });
}

export function applyTransferHypothesisToSimulation(election, simulation, hypothesis) {
  const baseline = computeSimulationTransferBaseline(election, simulation, hypothesis);
  if (!baseline) throw new Error("Cette hypothèse de report ne correspond pas aux finalistes du scénario.");
  simulation.abstention_to_a = baseline.abstention.pct_to_a;
  simulation.abstention_to_b = baseline.abstention.pct_to_b;
  for (const candidate of simulation.candidates) {
    const { pct_to_a, pct_to_b } = baseline.rows.get(candidate.id);
    candidate.transfer = { pct_to_a, pct_to_b };
  }
  simulation.r2_hypothesis_id = hypothesis.id;
}

function sameTransfer(current, expected) {
  return Number(current.pct_to_a) === expected.pct_to_a && Number(current.pct_to_b) === expected.pct_to_b;
}

// Propage une modification d'hypothèse aux scénarios liés, sans écraser les lignes personnalisées localement.
export function withTransferHypothesisSync(state, election, change) {
  const linked = state.simulations.filter((simulation) => (
    simulation.election_id === election.id && simulation.r2_hypothesis_id != null
  ));
  const baselineOf = (simulation) => {
    const hypothesis = election.transfer_hypotheses.find((item) => item.id === simulation.r2_hypothesis_id);
    return hypothesis ? computeSimulationTransferBaseline(election, simulation, hypothesis) : null;
  };
  const before = linked.map(baselineOf);
  const result = change();
  linked.forEach((simulation, index) => {
    const previous = before[index];
    const next = baselineOf(simulation);
    if (!previous || !next) return;
    const abstention = { pct_to_a: simulation.abstention_to_a, pct_to_b: simulation.abstention_to_b };
    if (sameTransfer(abstention, previous.abstention)) {
      simulation.abstention_to_a = next.abstention.pct_to_a;
      simulation.abstention_to_b = next.abstention.pct_to_b;
    }
    for (const candidate of simulation.candidates) {
      const old = previous.rows.get(candidate.id);
      const updated = next.rows.get(candidate.id);
      if (old && updated && sameTransfer(candidate.transfer, old)) {
        candidate.transfer = { pct_to_a: updated.pct_to_a, pct_to_b: updated.pct_to_b };
      }
    }
  });
  return result;
}

export function syncUpdatedHypothesisCandidate(state, election, hypothesis, sourceCandidate) {
  for (const simulation of state.simulations.filter((item) => (
    item.election_id === election.id && item.r1_hypothesis_id === hypothesis.id
  ))) {
    const candidate = simulation.candidates.find((item) => item.hypothesis_candidate_id === sourceCandidate.id);
    if (!candidate) continue;
    if (!candidate.r1_name_override) candidate.name = sourceCandidate.name;
    if (!candidate.r1_pct_override) candidate.pct_r1 = sourceCandidate.pct_r1;
  }
}

// Toutes les opérations sont async pour garder le contrat "Promise" utilisé par les composants.
export function mutate(id, apply) {
  return Promise.resolve().then(() => {
    const state = loadState();
    const simulation = findSimulation(state, id);
    const extra = apply(simulation, state);
    saveState(state);
    return { ...serializeSimulation(simulation), election_id: simulation.election_id, ...extra };
  });
}
