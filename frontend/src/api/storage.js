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

export function loadState() {
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

export function saveState(state) {
  memoryFallback = state;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      throw new Error("L'espace de stockage du navigateur est plein : la modification n'a pas été enregistrée.");
    }
  }
}

