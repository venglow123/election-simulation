import { loadState, saveState } from "./storage.js";
import {
  findElection,
  registerElectionCandidate,
  withTransferHypothesisSync,
  createSimulationRecord,
  createCandidateRecord,
  createHypothesisRecord,
  createHypothesisCandidateRecord,
  createTransferHypothesisRecord,
  createTransferRowRecord,
  getElectionCandidateUsageCount,
} from "./model.js";
import { isValidTagColor, normalizeTagName, pickTagColor } from "../utils/tags.js";
import { DEFAULT_ABSTENTION_COLOR, getAbstentionColor, isValidCandidateColor } from "../utils/candidateColors.js";
import { buildElectionPayload, validateElectionPayload } from "../utils/electionExchange.js";

function serializeTags(election) {
  return [...election.tags]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((tag) => ({
      ...tag,
      usage_count: [...election.hypotheses, ...election.transfer_hypotheses]
        .filter((hypothesis) => hypothesis.tag_ids.includes(tag.id)).length,
    }));
}

function assertUniqueTagName(election, name, ignoredId = null) {
  const normalized = normalizeTagName(name);
  if (election.tags.some((tag) => tag.id !== ignoredId && normalizeTagName(tag.name) === normalized)) {
    throw new Error(`Le tag « ${name} » existe déjà dans cette élection.`);
  }
}

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
      abstention_color: getAbstentionColor(election),
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
      transfer_hypotheses: [],
      tags: [],
      abstention_color: DEFAULT_ABSTENTION_COLOR,
    };
    state.elections.push(election);
    saveState(state);
    return { ...election, scenarios_count: 0 };
  },

  setElectionAbstentionColor: async (id, color) => {
    if (!isValidCandidateColor(color)) throw new Error("Couleur des abstentionnistes invalide.");
    const state = loadState();
    const election = findElection(state, id);
    election.abstention_color = color.toLowerCase();
    saveState(state);
    return election.abstention_color;
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

  exportElection: async (id) => {
    const state = loadState();
    const election = findElection(state, id);
    return buildElectionPayload(election, state.simulations.filter((simulation) => simulation.election_id === election.id));
  },

  importElection: async (payload) => {
    const { election: source } = validateElectionPayload(payload);
    const state = loadState();
    const now = new Date();
    const suffix = ` (${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")})`;
    const election = {
      id: state.nextElectionId++,
      name: `${source.name.slice(0, 200 - suffix.length)}${suffix}`,
      position: state.elections.length + 1,
      candidates: [],
      hypotheses: [],
      transfer_hypotheses: [],
      tags: [],
      abstention_color: source.abstention_color || DEFAULT_ABSTENTION_COLOR,
    };
    state.elections.push(election);

    const tagIds = source.tags.map((tag) => {
      const record = { id: state.nextTagId++, name: tag.name, color: tag.color };
      election.tags.push(record);
      return record.id;
    });
    for (const candidate of source.candidates) {
      registerElectionCandidate(state, election.id, candidate.name, candidate.party, candidate.color);
    }

    // Les références entre entités sont transmises par index : on les retraduit en identifiants locaux.
    const hypotheses = source.hypotheses.map((hypothesis) => {
      const record = createHypothesisRecord(state, election, {
        name: hypothesis.name,
        description: hypothesis.description,
        tag_ids: hypothesis.tags.map((index) => tagIds[index]),
      });
      for (const candidate of hypothesis.candidates) {
        createHypothesisCandidateRecord(state, election.id, record, candidate);
      }
      return record;
    });
    const transferHypotheses = source.transfer_hypotheses.map((hypothesis) => {
      const record = createTransferHypothesisRecord(state, election, {
        name: hypothesis.name,
        description: hypothesis.description,
        tag_ids: hypothesis.tags.map((index) => tagIds[index]),
        finalist_a: hypothesis.finalist_a,
        finalist_b: hypothesis.finalist_b,
        abstention_to_a: hypothesis.abstention_to_a,
        abstention_to_b: hypothesis.abstention_to_b,
      });
      for (const row of hypothesis.candidate_transfers) {
        createTransferRowRecord(state, record, "candidate", { ...row, key: row.name });
      }
      for (const row of hypothesis.party_transfers) {
        createTransferRowRecord(state, record, "party", { ...row, key: row.party });
      }
      return record;
    });

    for (const scenario of source.scenarios) {
      const hypothesis = scenario.r1_hypothesis == null ? null : hypotheses[scenario.r1_hypothesis];
      const simulation = createSimulationRecord(state, election.id, {
        name: scenario.name,
        description: scenario.description,
        total_inscrits: scenario.total_inscrits,
        abstention_r1: scenario.abstention_r1,
        abstention_to_a: scenario.abstention_to_a,
        abstention_to_b: scenario.abstention_to_b,
        r1_hypothesis_id: hypothesis?.id ?? null,
        r1_tag_ids: scenario.r1_tags.map((index) => tagIds[index]),
        r2_tag_ids: scenario.r2_tags.map((index) => tagIds[index]),
        r1_excluded_hypothesis_candidate_ids: hypothesis
          ? scenario.r1_excluded.map((index) => hypothesis.candidates[index].id)
          : [],
        r2_hypothesis_id: scenario.r2_hypothesis == null ? null : transferHypotheses[scenario.r2_hypothesis].id,
      });
      for (const candidate of scenario.candidates) {
        createCandidateRecord(state, simulation, {
          name: candidate.name,
          pct_r1: candidate.pct_r1,
          pct_to_a: candidate.pct_to_a,
          pct_to_b: candidate.pct_to_b,
          hypothesis_candidate_id: hypothesis && candidate.hypothesis_candidate != null
            ? hypothesis.candidates[candidate.hypothesis_candidate].id
            : null,
          r1_name_override: candidate.r1_name_override,
          r1_pct_override: candidate.r1_pct_override,
        });
      }
    }

    saveState(state);
    return {
      id: election.id,
      name: election.name,
      position: election.position,
      scenarios_count: source.scenarios.length,
    };
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
        usage_count: getElectionCandidateUsageCount(state, election, candidate.name),
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
    registerElectionCandidate(state, election.id, name, payload.party, payload.color);
    saveState(state);
    return electionApi.listElectionCandidates(election.id);
  },

  setElectionCandidateColor: async (electionId, name, color) => {
    if (!isValidCandidateColor(color)) throw new Error("Couleur de candidat invalide.");
    const state = loadState();
    const election = findElection(state, electionId);
    const candidate = registerElectionCandidate(state, election.id, name);
    if (!candidate) throw new Error("Le nom du candidat est obligatoire.");
    candidate.color = color.toLowerCase();
    saveState(state);
    return electionApi.listElectionCandidates(election.id);
  },

  updateElectionCandidate: async (electionId, candidateId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const candidate = election.candidates.find((item) => item.id === Number(candidateId));
    if (!candidate) throw new Error("Candidat introuvable.");
    const oldName = candidate.name;
    // Un changement de parti modifie la résolution des reports par parti des scénarios liés.
    withTransferHypothesisSync(state, election, () => {
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
        for (const hypothesis of election.transfer_hypotheses) {
          if (hypothesis.finalist_a === oldName) hypothesis.finalist_a = name;
          if (hypothesis.finalist_b === oldName) hypothesis.finalist_b = name;
          for (const row of hypothesis.candidate_transfers) {
            if (row.name === oldName) row.name = name;
          }
        }
      }
      if ("party" in payload) candidate.party = (payload.party || "").trim();
      if ("color" in payload) {
        if (!isValidCandidateColor(payload.color)) throw new Error("Couleur de candidat invalide.");
        candidate.color = payload.color.toLowerCase();
      }
    });
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

  listElectionTags: async (electionId) => serializeTags(findElection(loadState(), electionId)),

  createElectionTag: async (electionId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Le nom du tag est obligatoire.");
    assertUniqueTagName(election, name);
    const tag = {
      id: state.nextTagId++,
      name,
      color: isValidTagColor(payload.color)
        ? payload.color.toLowerCase()
        : pickTagColor(election.tags.map((item) => item.color)),
    };
    election.tags.push(tag);
    saveState(state);
    return { ...tag, usage_count: 0 };
  },

  updateElectionTag: async (electionId, tagId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const tag = election.tags.find((item) => item.id === Number(tagId));
    if (!tag) throw new Error("Tag introuvable.");
    if ("name" in payload) {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Le nom du tag est obligatoire.");
      assertUniqueTagName(election, name, tag.id);
      tag.name = name;
    }
    if ("color" in payload) {
      if (!isValidTagColor(payload.color)) throw new Error("Couleur de tag invalide.");
      tag.color = payload.color.toLowerCase();
    }
    saveState(state);
    return serializeTags(election);
  },

  deleteElectionTag: async (electionId, tagId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    election.tags = election.tags.filter((tag) => tag.id !== Number(tagId));
    for (const hypothesis of [...election.hypotheses, ...election.transfer_hypotheses]) {
      hypothesis.tag_ids = hypothesis.tag_ids.filter((id) => id !== Number(tagId));
    }
    for (const simulation of state.simulations.filter((item) => item.election_id === election.id)) {
      simulation.r1_tag_ids = simulation.r1_tag_ids.filter((id) => id !== Number(tagId));
      simulation.r2_tag_ids = simulation.r2_tag_ids.filter((id) => id !== Number(tagId));
    }
    saveState(state);
    return serializeTags(election);
  },

};
