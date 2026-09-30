import { loadState, saveState } from "./storage.js";
import { toFloat, findHypothesis, findHypothesisCandidate, findElection, registerElectionCandidate, createCandidateRecord, createHypothesisRecord, createHypothesisCandidateRecord, detachHypothesisFromSimulation, syncUpdatedHypothesisCandidate } from "./model.js";

export const hypothesisApi = {
  listElectionHypotheses: async (electionId) => {
    const election = findElection(loadState(), electionId);
    return [...election.hypotheses]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((hypothesis) => ({ ...hypothesis, candidates: hypothesis.candidates.map((candidate) => ({ ...candidate })) }));
  },

  getElectionHypothesis: async (electionId, hypothesisId) => {
    const election = findElection(loadState(), electionId);
    const hypothesis = findHypothesis(election, hypothesisId);
    return { ...hypothesis, candidates: hypothesis.candidates.map((candidate) => ({ ...candidate })) };
  },

  createElectionHypothesis: async (electionId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = createHypothesisRecord(state, election);
    saveState(state);
    return { ...hypothesis, candidates: [] };
  },

  updateElectionHypothesis: async (electionId, hypothesisId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findHypothesis(election, hypothesisId);
    if ("name" in payload) {
      const name = (payload.name || "").trim();
      if (name) hypothesis.name = name;
    }
    if ("description" in payload) hypothesis.description = (payload.description || "").trim();
    saveState(state);
    return { ...hypothesis, candidates: hypothesis.candidates.map((candidate) => ({ ...candidate })) };
  },

  duplicateElectionHypothesis: async (electionId, hypothesisId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const original = findHypothesis(election, hypothesisId);
    const copy = createHypothesisRecord(state, election, {
      name: `${original.name} (copie)`,
      description: original.description,
    });
    for (const candidate of original.candidates) {
      createHypothesisCandidateRecord(state, election.id, copy, candidate);
    }
    saveState(state);
    return { ...copy, candidates: copy.candidates.map((candidate) => ({ ...candidate })) };
  },

  deleteElectionHypothesis: async (electionId, hypothesisId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    findHypothesis(election, hypothesisId);
    for (const simulation of state.simulations.filter((item) => (
      item.election_id === election.id && item.r1_hypothesis_id === Number(hypothesisId)
    ))) {
      detachHypothesisFromSimulation(simulation);
    }
    election.hypotheses = election.hypotheses.filter((item) => item.id !== Number(hypothesisId));
    saveState(state);
    return { status: "ok" };
  },

  addHypothesisCandidate: async (electionId, hypothesisId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findHypothesis(election, hypothesisId);
    const name = (payload.name || "").trim();
    if (!name) throw new Error("Le nom du candidat est obligatoire.");
    const candidate = createHypothesisCandidateRecord(state, election.id, hypothesis, {
      name,
      pct_r1: Math.max(toFloat(payload.pct_r1, 0), 0),
    });
    for (const simulation of state.simulations.filter((item) => (
      item.election_id === election.id && item.r1_hypothesis_id === hypothesis.id
    ))) {
      if (simulation.r1_excluded_hypothesis_candidate_ids.includes(candidate.id)) continue;
      createCandidateRecord(state, simulation, {
        ...candidate,
        hypothesis_candidate_id: candidate.id,
      });
    }
    saveState(state);
    return { ...hypothesis, candidates: hypothesis.candidates.map((candidate) => ({ ...candidate })) };
  },

  updateHypothesisCandidate: async (electionId, hypothesisId, candidateId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findHypothesis(election, hypothesisId);
    const candidate = findHypothesisCandidate(hypothesis, candidateId);
    if ("name" in payload) {
      const name = (payload.name || "").trim();
      if (name) {
        candidate.name = name;
        registerElectionCandidate(state, election.id, name);
      }
    }
    if ("pct_r1" in payload) candidate.pct_r1 = Math.max(toFloat(payload.pct_r1, candidate.pct_r1), 0);
    syncUpdatedHypothesisCandidate(state, election, hypothesis, candidate);
    saveState(state);
    return { ...hypothesis, candidates: hypothesis.candidates.map((item) => ({ ...item })) };
  },

  deleteHypothesisCandidate: async (electionId, hypothesisId, candidateId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findHypothesis(election, hypothesisId);
    findHypothesisCandidate(hypothesis, candidateId);
    hypothesis.candidates = hypothesis.candidates.filter((item) => item.id !== Number(candidateId));
    for (const simulation of state.simulations.filter((item) => (
      item.election_id === election.id && item.r1_hypothesis_id === hypothesis.id
    ))) {
      simulation.candidates = simulation.candidates.filter((candidate) => (
        candidate.hypothesis_candidate_id !== Number(candidateId)
      ));
      simulation.r1_excluded_hypothesis_candidate_ids = simulation.r1_excluded_hypothesis_candidate_ids
        .filter((id) => id !== Number(candidateId));
    }
    saveState(state);
    return { ...hypothesis, candidates: hypothesis.candidates.map((candidate) => ({ ...candidate })) };
  },

};
