// Persistance 100 % navigateur (localStorage) exposant la même interface que l'ancienne API HTTP.
import { serializeSimulation } from "./utils/simulationEngine.js";
import { validateScenarioPayload } from "./utils/scenarioExchange.js";

const STORAGE_KEY = "election-simulation:v1";

let memoryFallback = null;

function emptyState() {
  return { nextSimulationId: 1, nextCandidateId: 1, simulations: [] };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.simulations)) return emptyState();
    return state;
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

function nextPosition(state) {
  return state.simulations.reduce((max, s) => Math.max(max, s.position), 0) + 1;
}

function createSimulationRecord(state, fields) {
  const simulation = {
    id: state.nextSimulationId++,
    name: "Nouvelle simulation",
    description: "",
    position: nextPosition(state),
    created_at: new Date().toISOString(),
    total_inscrits: 1000,
    abstention_r1: 0,
    abstention_to_a: 0,
    abstention_to_b: 0,
    candidates: [],
    ...fields,
  };
  state.simulations.push(simulation);
  return simulation;
}

function createCandidateRecord(state, simulation, { name, pct_r1 = 0, pct_to_a = 0, pct_to_b = 0 }) {
  const candidate = { id: state.nextCandidateId++, name, pct_r1, transfer: { pct_to_a, pct_to_b } };
  simulation.candidates.push(candidate);
  return candidate;
}

// Toutes les opérations sont async pour garder le contrat "Promise" utilisé par les composants.
function mutate(id, apply) {
  return Promise.resolve().then(() => {
    const state = loadState();
    const simulation = findSimulation(state, id);
    const extra = apply(simulation, state);
    saveState(state);
    return { ...serializeSimulation(simulation), ...extra };
  });
}

export const api = {
  listSimulations: async () =>
    [...loadState().simulations]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        position: s.position,
        candidates_count: s.candidates.length,
      })),

  getSimulation: async (id) => serializeSimulation(findSimulation(loadState(), id)),

  createSimulation: async (name) => {
    const state = loadState();
    const simulation = createSimulationRecord(state, { name: (name || "").trim() || "Nouvelle simulation" });
    saveState(state);
    return serializeSimulation(simulation);
  },

  importSimulation: async (payload) => {
    const { scenario } = validateScenarioPayload(payload);
    const now = new Date();
    const dateSuffix = ` (${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")})`;
    const state = loadState();
    const simulation = createSimulationRecord(state, {
      name: `${scenario.name.slice(0, 200 - dateSuffix.length)}${dateSuffix}`,
      description: scenario.description,
      total_inscrits: scenario.total_inscrits,
      abstention_r1: scenario.abstention_r1,
      abstention_to_a: scenario.abstention_to_a,
      abstention_to_b: scenario.abstention_to_b,
    });
    for (const candidate of scenario.candidates) createCandidateRecord(state, simulation, candidate);
    saveState(state);
    return serializeSimulation(simulation);
  },

  reorderSimulations: async (order) => {
    const state = loadState();
    order.forEach((simId, index) => {
      const simulation = state.simulations.find((s) => s.id === Number(simId));
      if (simulation) simulation.position = index;
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
    const copy = createSimulationRecord(state, {
      name: `${original.name} (copie)`,
      description: original.description,
      total_inscrits: original.total_inscrits,
      abstention_r1: original.abstention_r1,
      abstention_to_a: original.abstention_to_a,
      abstention_to_b: original.abstention_to_b,
    });
    for (const c of original.candidates) {
      createCandidateRecord(state, copy, { name: c.name, pct_r1: c.pct_r1, ...c.transfer });
    }
    saveState(state);
    return serializeSimulation(copy);
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
      const candidate = createCandidateRecord(state, simulation, { name, pct_r1: toFloat(data.pct_r1, 0) });
      return { new_candidate_id: candidate.id };
    }),

  updateCandidate: (id, candidateId, data) =>
    mutate(id, (simulation) => {
      const candidate = findCandidate(simulation, candidateId);
      if ("name" in data) {
        const name = (data.name || "").trim();
        if (name) candidate.name = name;
      }
      if ("pct_r1" in data) candidate.pct_r1 = Math.max(toFloat(data.pct_r1, candidate.pct_r1), 0);
    }),

  deleteCandidate: (id, candidateId) =>
    mutate(id, (simulation) => {
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
