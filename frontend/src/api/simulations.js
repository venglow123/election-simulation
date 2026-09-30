import { loadState, saveState } from "./storage.js";
import { toFloat, toInt, findSimulation, findCandidate, findHypothesis, findElection, ensureDefaultElection, registerElectionCandidate, createSimulationRecord, createCandidateRecord, createHypothesisRecord, createHypothesisCandidateRecord, applyHypothesisToSimulation, detachHypothesisFromSimulation, getSimulationPayload, mutate } from "./model.js";
import { serializeSimulation } from "../utils/simulationEngine.js";
import { validateScenarioPayload } from "../utils/scenarioExchange.js";

export const simulationApi = {
  listSimulations: async (electionId) =>
    [...loadState().simulations]
      .filter((simulation) => electionId == null || simulation.election_id === Number(electionId))
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        position: s.position,
        candidates_count: s.candidates.length,
      })),

  getSimulation: async (id, simulationId) => {
    const state = loadState();
    const simulation = findSimulation(state, simulationId ?? id);
    if (simulationId != null && simulation.election_id !== Number(id)) throw new Error("Scénario introuvable.");
    return getSimulationPayload(simulation);
  },

  setSimulationFirstRoundHypothesis: async (electionId, simulationId, hypothesisId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const simulation = findSimulation(state, simulationId);
    if (simulation.election_id !== election.id) throw new Error("Scénario introuvable.");
    if (hypothesisId == null) {
      detachHypothesisFromSimulation(simulation);
    } else {
      const hypothesis = findHypothesis(election, hypothesisId);
      applyHypothesisToSimulation(state, election, simulation, hypothesis);
    }
    saveState(state);
    return getSimulationPayload(simulation);
  },

  resetSimulationFirstRoundHypothesis: async (electionId, simulationId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const simulation = findSimulation(state, simulationId);
    if (simulation.election_id !== election.id || simulation.r1_hypothesis_id == null) {
      throw new Error("Aucune hypothèse n'est sélectionnée pour ce scénario.");
    }
    const hypothesis = findHypothesis(election, simulation.r1_hypothesis_id);
    applyHypothesisToSimulation(state, election, simulation, hypothesis);
    saveState(state);
    return getSimulationPayload(simulation);
  },

  saveSimulationAsFirstRoundHypothesis: async (electionId, simulationId, candidateValues) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const simulation = findSimulation(state, simulationId);
    if (simulation.election_id !== election.id) throw new Error("Scénario introuvable.");
    const values = Array.isArray(candidateValues) ? candidateValues : simulation.candidates;
    const hypothesis = createHypothesisRecord(state, election);
    const sourceCandidates = values.map((candidate) => createHypothesisCandidateRecord(state, election.id, hypothesis, {
      name: String(candidate.name || "").trim(),
      pct_r1: Math.max(toFloat(candidate.pct_r1, 0), 0),
    }));
    simulation.r1_hypothesis_id = hypothesis.id;
    simulation.r1_excluded_hypothesis_candidate_ids = [];
    simulation.candidates = simulation.candidates.map((candidate, index) => ({
      ...candidate,
      name: sourceCandidates[index].name,
      pct_r1: sourceCandidates[index].pct_r1,
      hypothesis_candidate_id: sourceCandidates[index].id,
      r1_name_override: false,
      r1_pct_override: false,
    })).slice(0, sourceCandidates.length);
    saveState(state);
    return {
      hypothesis: { ...hypothesis, candidates: hypothesis.candidates.map((candidate) => ({ ...candidate })) },
      simulation: getSimulationPayload(simulation),
    };
  },

  createSimulation: async (electionId, name) => {
    if (name === undefined) {
      name = electionId;
      electionId = null;
    }
    const state = loadState();
    const election = electionId == null ? ensureDefaultElection(state) : findElection(state, electionId);
    const simulation = createSimulationRecord(state, election.id, { name: (name || "").trim() || "Nouvelle simulation" });
    saveState(state);
    return { ...serializeSimulation(simulation), election_id: election.id };
  },

  importSimulation: async (electionId, payload) => {
    if (payload === undefined) {
      payload = electionId;
      electionId = null;
    }
    const { scenario } = validateScenarioPayload(payload);
    const now = new Date();
    const dateSuffix = ` (${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")})`;
    const state = loadState();
    const election = electionId == null ? ensureDefaultElection(state) : findElection(state, electionId);
    const simulation = createSimulationRecord(state, election.id, {
      name: `${scenario.name.slice(0, 200 - dateSuffix.length)}${dateSuffix}`,
      description: scenario.description,
      total_inscrits: scenario.total_inscrits,
      abstention_r1: scenario.abstention_r1,
      abstention_to_a: scenario.abstention_to_a,
      abstention_to_b: scenario.abstention_to_b,
    });
    for (const candidate of scenario.candidates) createCandidateRecord(state, simulation, candidate);
    saveState(state);
    return { ...serializeSimulation(simulation), election_id: election.id };
  },

  reorderSimulations: async (electionId, order) => {
    if (order === undefined) {
      order = electionId;
      electionId = null;
    }
    const state = loadState();
    order.forEach((simId, index) => {
      const simulation = state.simulations.find((s) => s.id === Number(simId));
      if (simulation && (electionId == null || simulation.election_id === Number(electionId))) simulation.position = index;
    });
    saveState(state);
    return { status: "ok" };
  },

  updateSimulation: (id, data) =>
    mutate(id, (simulation) => {
      if ("name" in data) {
        const name = (data.name || "").trim();
        if (name) simulation.name = name;
      }
      if ("description" in data) simulation.description = (data.description || "").trim();
      if ("total_inscrits" in data) {
        simulation.total_inscrits = Math.max(toInt(data.total_inscrits, simulation.total_inscrits), 0);
      }
      if ("abstention_r1" in data) {
        simulation.abstention_r1 = Math.min(
          Math.max(toInt(data.abstention_r1, simulation.abstention_r1), 0),
          simulation.total_inscrits
        );
      }
    }),

  duplicateSimulation: async (id) => {
    const state = loadState();
    const original = findSimulation(state, id);
    const copy = createSimulationRecord(state, original.election_id, {
      name: `${original.name} (copie)`,
      description: original.description,
      total_inscrits: original.total_inscrits,
      abstention_r1: original.abstention_r1,
      abstention_to_a: original.abstention_to_a,
      abstention_to_b: original.abstention_to_b,
      r1_hypothesis_id: original.r1_hypothesis_id,
      r1_excluded_hypothesis_candidate_ids: [...original.r1_excluded_hypothesis_candidate_ids],
    });
    for (const c of original.candidates) {
      createCandidateRecord(state, copy, {
        name: c.name,
        pct_r1: c.pct_r1,
        ...c.transfer,
        hypothesis_candidate_id: c.hypothesis_candidate_id,
        r1_name_override: c.r1_name_override,
        r1_pct_override: c.r1_pct_override,
      });
    }
    saveState(state);
    return { ...serializeSimulation(copy), election_id: copy.election_id };
  },

  deleteSimulation: async (id) => {
    const state = loadState();
    state.simulations = state.simulations.filter((s) => s.id !== Number(id));
    saveState(state);
    return { status: "ok" };
  },

  addCandidate: (id, data) =>
    mutate(id, (simulation, state) => {
      const name = (data.name || "").trim();
      if (!name) throw new Error("Le nom du candidat est obligatoire.");
      registerElectionCandidate(state, simulation.election_id, name);
      const candidate = createCandidateRecord(state, simulation, { name, pct_r1: toFloat(data.pct_r1, 0) });
      return { new_candidate_id: candidate.id };
    }),

  updateCandidate: (id, candidateId, data) =>
    mutate(id, (simulation, state) => {
      const candidate = findCandidate(simulation, candidateId);
      const hypothesis = simulation.r1_hypothesis_id == null
        ? null
        : findElection(state, simulation.election_id).hypotheses.find((item) => item.id === simulation.r1_hypothesis_id);
      const source = hypothesis?.candidates.find((item) => item.id === candidate.hypothesis_candidate_id);
      if ("name" in data) {
        const name = (data.name || "").trim();
        if (name) {
          candidate.name = name;
          if (candidate.hypothesis_candidate_id != null) {
            candidate.r1_name_override = source ? name !== source.name : true;
          }
          registerElectionCandidate(state, simulation.election_id, name);
        }
      }
      if ("pct_r1" in data) {
        candidate.pct_r1 = Math.max(toFloat(data.pct_r1, candidate.pct_r1), 0);
        if (candidate.hypothesis_candidate_id != null) {
          candidate.r1_pct_override = source ? candidate.pct_r1 !== source.pct_r1 : true;
        }
      }
    }),

  deleteCandidate: (id, candidateId) =>
    mutate(id, (simulation) => {
      const candidate = findCandidate(simulation, candidateId);
      if (candidate.hypothesis_candidate_id != null && simulation.r1_hypothesis_id != null) {
        simulation.r1_excluded_hypothesis_candidate_ids.push(candidate.hypothesis_candidate_id);
      }
      simulation.candidates = simulation.candidates.filter((c) => c.id !== Number(candidateId));
    }),

  updateTransfer: (id, candidateId, data) =>
    mutate(id, (simulation) => {
      const { transfer } = findCandidate(simulation, candidateId);
      if ("pct_to_a" in data) transfer.pct_to_a = Math.max(toFloat(data.pct_to_a, transfer.pct_to_a), 0);
      if ("pct_to_b" in data) transfer.pct_to_b = Math.max(toFloat(data.pct_to_b, transfer.pct_to_b), 0);
    }),

  updateAbstentionTransfer: (id, data) =>
    mutate(id, (simulation) => {
      if ("pct_to_a" in data) {
        simulation.abstention_to_a = Math.max(toFloat(data.pct_to_a, simulation.abstention_to_a), 0);
      }
      if ("pct_to_b" in data) {
        simulation.abstention_to_b = Math.max(toFloat(data.pct_to_b, simulation.abstention_to_b), 0);
      }
    }),
};
