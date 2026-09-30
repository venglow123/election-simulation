// Persistance 100 % navigateur (localStorage) exposant la même interface que l'ancienne API HTTP.
import { serializeSimulation } from "./utils/simulationEngine.js";
import { validateScenarioPayload } from "./utils/scenarioExchange.js";

const STORAGE_KEY = "election-simulation:v2";
const LEGACY_STORAGE_KEY = "election-simulation:v1";

let memoryFallback = null;

function emptyState() {
  return {
    version: 2,
    nextElectionId: 1,
    nextElectionCandidateId: 1,
    nextHypothesisId: 1,
    nextHypothesisCandidateId: 1,
    nextSimulationId: 1,
    nextCandidateId: 1,
    elections: [],
    simulations: [],
  };
}

function maxId(records) {
  return records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
}

function normalizeState(raw) {
  if (!raw || !Array.isArray(raw.simulations)) return emptyState();
  const state = {
    ...emptyState(),
    ...raw,
    elections: Array.isArray(raw.elections) ? raw.elections.map((election, index) => ({
      ...election,
      id: Number(election.id) || index + 1,
      name: String(election.name || "Nouvelle élection"),
      position: Number.isFinite(Number(election.position)) ? Number(election.position) : index + 1,
      candidates: Array.isArray(election.candidates) ? election.candidates.map((candidate, candidateIndex) => ({
        ...candidate,
        id: Number(candidate.id) || candidateIndex + 1,
        name: String(candidate.name || ""),
        party: String(candidate.party || ""),
      })) : [],
      hypotheses: Array.isArray(election.hypotheses) ? election.hypotheses.map((hypothesis, hypothesisIndex) => ({
        ...hypothesis,
        id: Number(hypothesis.id) || hypothesisIndex + 1,
        name: String(hypothesis.name || "Nouvelle hypothèse"),
        description: String(hypothesis.description || ""),
        position: Number.isFinite(Number(hypothesis.position)) ? Number(hypothesis.position) : hypothesisIndex + 1,
        candidates: Array.isArray(hypothesis.candidates) ? hypothesis.candidates.map((candidate, candidateIndex) => ({
          ...candidate,
          id: Number(candidate.id) || candidateIndex + 1,
          name: String(candidate.name || ""),
          pct_r1: Number.isFinite(Number(candidate.pct_r1)) ? Number(candidate.pct_r1) : 0,
        })) : [],
      })) : [],
    })) : [],
    simulations: raw.simulations.map((simulation, index) => ({
      ...simulation,
      id: Number(simulation.id) || index + 1,
      election_id: Number.isFinite(Number(simulation.election_id)) ? Number(simulation.election_id) : null,
      position: Number.isFinite(Number(simulation.position)) ? Number(simulation.position) : index + 1,
      r1_hypothesis_id: simulation.r1_hypothesis_id != null && Number.isFinite(Number(simulation.r1_hypothesis_id))
        ? Number(simulation.r1_hypothesis_id)
        : null,
      r1_excluded_hypothesis_candidate_ids: Array.isArray(simulation.r1_excluded_hypothesis_candidate_ids)
        ? simulation.r1_excluded_hypothesis_candidate_ids.map(Number)
        : [],
      candidates: Array.isArray(simulation.candidates) ? simulation.candidates.map((candidate) => ({
        ...candidate,
        hypothesis_candidate_id: candidate.hypothesis_candidate_id != null && Number.isFinite(Number(candidate.hypothesis_candidate_id))
          ? Number(candidate.hypothesis_candidate_id)
          : null,
        r1_name_override: Boolean(candidate.r1_name_override),
        r1_pct_override: Boolean(candidate.r1_pct_override),
      })) : [],
    })),
  };
  const unassigned = state.simulations.filter((simulation) =>
    !state.elections.some((election) => election.id === Number(simulation.election_id))
  );
  if (unassigned.length) {
    const election = {
      id: maxId(state.elections) + 1,
      name: "Élection existante",
      position: state.elections.length + 1,
      candidates: [],
      hypotheses: [],
    };
    const candidateNames = new Set();
    for (const simulation of unassigned) {
      simulation.election_id = election.id;
      for (const candidate of simulation.candidates || []) {
        const name = String(candidate.name || "").trim();
        if (!name || candidateNames.has(name)) continue;
        candidateNames.add(name);
        election.candidates.push({ id: state.nextElectionCandidateId++, name, party: "" });
      }
    }
    state.elections.push(election);
  }
  state.nextElectionId = Math.max(Number(state.nextElectionId) || 1, maxId(state.elections) + 1);
  state.nextElectionCandidateId = Math.max(
    Number(state.nextElectionCandidateId) || 1,
    ...state.elections.flatMap((election) => [maxId(election.candidates) + 1])
  );
  state.nextHypothesisId = Math.max(
    Number(state.nextHypothesisId) || 1,
    ...state.elections.flatMap((election) => [maxId(election.hypotheses) + 1])
  );
  state.nextHypothesisCandidateId = Math.max(
    Number(state.nextHypothesisCandidateId) || 1,
    ...state.elections.flatMap((election) => election.hypotheses.map((hypothesis) => maxId(hypothesis.candidates) + 1))
  );
  state.nextSimulationId = Math.max(Number(state.nextSimulationId) || 1, maxId(state.simulations) + 1);
  state.nextCandidateId = Math.max(
    Number(state.nextCandidateId) || 1,
    ...state.simulations.flatMap((simulation) => [maxId(simulation.candidates || []) + 1])
  );
  state.version = 2;
  return state;
}

function loadState() {
  try {
    if (typeof window === "undefined") return memoryFallback ?? emptyState();
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (parsed && Array.isArray(parsed.simulations)) return normalizeState(parsed);
      } catch {
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return emptyState();
    const migrated = normalizeState(JSON.parse(legacy));
    saveState(migrated);
    return migrated;
  } catch {
    // localStorage indisponible (navigation privée stricte, etc.) : on garde les données en mémoire.
    return memoryFallback ?? emptyState();
  }
}

function saveState(state) {
  memoryFallback = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      throw new Error("L'espace de stockage du navigateur est plein : la modification n'a pas été enregistrée.");
    }
  }
}

function toFloat(value, fallback = 0) {
  const parsed = Number(String(value).replace(",", "."));
  return value === null || value === "" || !Number.isFinite(parsed) ? fallback : parsed;
}

function toInt(value, fallback = 0) {
  return Math.trunc(toFloat(value, fallback));
}

function findSimulation(state, id) {
  const simulation = state.simulations.find((s) => s.id === Number(id));
  if (!simulation) throw new Error("Scénario introuvable.");
  return simulation;
}

function findCandidate(simulation, candidateId) {
  const candidate = simulation.candidates.find((c) => c.id === Number(candidateId));
  if (!candidate) throw new Error("Candidat introuvable.");
  return candidate;
}

function findHypothesis(election, hypothesisId) {
  const hypothesis = election.hypotheses.find((item) => item.id === Number(hypothesisId));
  if (!hypothesis) throw new Error("Hypothèse introuvable.");
  return hypothesis;
}

function findHypothesisCandidate(hypothesis, candidateId) {
  const candidate = hypothesis.candidates.find((item) => item.id === Number(candidateId));
  if (!candidate) throw new Error("Candidat introuvable.");
  return candidate;
}

function nextPosition(state, electionId) {
  return state.simulations
    .filter((simulation) => simulation.election_id === electionId)
    .reduce((max, simulation) => Math.max(max, simulation.position), 0) + 1;
}

function findElection(state, id) {
  const election = state.elections.find((item) => item.id === Number(id));
  if (!election) throw new Error("Élection introuvable.");
  return election;
}

function ensureDefaultElection(state) {
  if (!state.elections.length) {
    state.elections.push({
      id: state.nextElectionId++,
      name: "Nouvelle élection",
      position: 1,
      candidates: [],
      hypotheses: [],
    });
  }
  return state.elections[0];
}

function registerElectionCandidate(state, electionId, name, party = "") {
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

function createSimulationRecord(state, electionId, fields) {
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
    r1_excluded_hypothesis_candidate_ids: [],
    candidates: [],
    ...fields,
  };
  state.simulations.push(simulation);
  return simulation;
}

function createCandidateRecord(state, simulation, {
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

function createHypothesisRecord(state, election, fields = {}) {
  const hypothesis = {
    id: state.nextHypothesisId++,
    name: "Nouvelle hypothèse",
    description: "",
    position: election.hypotheses.reduce((max, item) => Math.max(max, item.position), 0) + 1,
    candidates: [],
    ...fields,
  };
  election.hypotheses.push(hypothesis);
  return hypothesis;
}

function createHypothesisCandidateRecord(state, electionId, hypothesis, { name, pct_r1 = 0 }) {
  const candidate = { id: state.nextHypothesisCandidateId++, name, pct_r1 };
  hypothesis.candidates.push(candidate);
  registerElectionCandidate(state, electionId, name);
  return candidate;
}

function applyHypothesisToSimulation(state, election, simulation, hypothesis) {
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

function detachHypothesisFromSimulation(simulation) {
  simulation.r1_hypothesis_id = null;
  simulation.r1_excluded_hypothesis_candidate_ids = [];
  simulation.candidates = simulation.candidates.map((candidate) => ({
    ...candidate,
    hypothesis_candidate_id: null,
    r1_name_override: false,
    r1_pct_override: false,
  }));
}

function getSimulationPayload(simulation) {
  return { ...serializeSimulation(simulation), election_id: simulation.election_id };
}

function syncUpdatedHypothesisCandidate(state, election, hypothesis, sourceCandidate) {
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
function mutate(id, apply) {
  return Promise.resolve().then(() => {
    const state = loadState();
    const simulation = findSimulation(state, id);
    const extra = apply(simulation, state);
    saveState(state);
    return { ...serializeSimulation(simulation), election_id: simulation.election_id, ...extra };
  });
}

export const api = {
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
    return api.listElectionCandidates(election.id);
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
    return api.listElectionCandidates(election.id);
  },

  deleteElectionCandidate: async (electionId, candidateId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    election.candidates = election.candidates.filter((candidate) => candidate.id !== Number(candidateId));
    saveState(state);
    return api.listElectionCandidates(election.id);
  },

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
