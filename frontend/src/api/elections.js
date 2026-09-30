import { loadState, saveState } from "./storage.js";
import { findElection, registerElectionCandidate } from "./model.js";

export const electionApi = {
  listElections: async () => {
    const state = loadState();
    return [...state.elections]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((election) => ({
        id: election.id,
        name: election.name,
        position: election.position,
        scenarios_count: state.simulations.filter((simulation) => simulation.election_id === election.id).length,
      }));
  },

  getElection: async (id) => {
    const state = loadState();
    const election = findElection(state, id);
    return {
      ...election,
      scenarios_count: state.simulations.filter((simulation) => simulation.election_id === election.id).length,
    };
  },

  createElection: async (name) => {
    const state = loadState();
    const election = {
      id: state.nextElectionId++,
      name: (name || "").trim() || "Nouvelle élection",
      position: state.elections.length + 1,
      candidates: [],
      hypotheses: [],
    };
    state.elections.push(election);
    saveState(state);
    return { ...election, scenarios_count: 0 };
  },

  updateElection: async (id, payload) => {
    const state = loadState();
    const election = findElection(state, id);
    const name = (payload.name || "").trim();
    if (!name) throw new Error("Le nom de l'élection est obligatoire.");
    election.name = name;
    saveState(state);
    return { ...election, scenarios_count: state.simulations.filter((simulation) => simulation.election_id === election.id).length };
  },

  deleteElection: async (id) => {
    const state = loadState();
    state.elections = state.elections.filter((election) => election.id !== Number(id));
    state.simulations = state.simulations.filter((simulation) => simulation.election_id !== Number(id));
    saveState(state);
    return { status: "ok" };
  },

  listElectionCandidates: async (electionId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    return [...election.candidates]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((candidate) => ({
        ...candidate,
        usage_count: state.simulations
          .filter((simulation) => simulation.election_id === election.id)
          .reduce((count, simulation) => count + simulation.candidates.filter((item) => item.name === candidate.name).length, 0)
          + election.hypotheses.reduce((count, hypothesis) => (
            count + hypothesis.candidates.filter((item) => item.name === candidate.name).length
          ), 0),
      }));
  },

  createElectionCandidate: async (electionId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const name = (payload.name || "").trim();
    if (!name) throw new Error("Le nom du candidat est obligatoire.");
    if (election.candidates.some((candidate) => candidate.name === name)) {
      throw new Error("Ce candidat existe déjà dans cette élection.");
    }
    registerElectionCandidate(state, election.id, name, payload.party);
    saveState(state);
    return electionApi.listElectionCandidates(election.id);
  },

  updateElectionCandidate: async (electionId, candidateId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const candidate = election.candidates.find((item) => item.id === Number(candidateId));
    if (!candidate) throw new Error("Candidat introuvable.");
    const oldName = candidate.name;
    if ("name" in payload) {
      const name = (payload.name || "").trim();
      if (!name) throw new Error("Le nom du candidat est obligatoire.");
      if (election.candidates.some((item) => item.id !== candidate.id && item.name === name)) {
        throw new Error("Ce nom est déjà utilisé par un autre candidat de l'élection.");
      }
      candidate.name = name;
      for (const simulation of state.simulations.filter((item) => item.election_id === election.id)) {
        for (const scenarioCandidate of simulation.candidates) {
          if (scenarioCandidate.name === oldName) scenarioCandidate.name = name;
        }
      }
      for (const hypothesis of election.hypotheses) {
        for (const hypothesisCandidate of hypothesis.candidates) {
          if (hypothesisCandidate.name === oldName) hypothesisCandidate.name = name;
        }
      }
    }
    if ("party" in payload) candidate.party = (payload.party || "").trim();
    saveState(state);
    return electionApi.listElectionCandidates(election.id);
  },

  deleteElectionCandidate: async (electionId, candidateId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    election.candidates = election.candidates.filter((candidate) => candidate.id !== Number(candidateId));
    saveState(state);
    return electionApi.listElectionCandidates(election.id);
  },

};
