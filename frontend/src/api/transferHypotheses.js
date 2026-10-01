import { loadState, saveState } from "./storage.js";
import {
  toFloat,
  findElection,
  findTransferHypothesis,
  createTransferHypothesisRecord,
  createTransferRowRecord,
  serializeTransferHypothesis,
  withTransferHypothesisSync,
  TRANSFER_ROW_KINDS,
} from "./model.js";
import { normalizeKey } from "../utils/transferHypothesis.js";

const pct = (value, fallback = 0) => Math.max(toFloat(value, fallback), 0);

function rowKind(kind) {
  const config = TRANSFER_ROW_KINDS[kind];
  if (!config) throw new Error("Type de report inconnu.");
  return config;
}

function assertUniqueRowKey(hypothesis, kind, key, ignoredId = null) {
  const { list, key: keyField, label } = rowKind(kind);
  const normalized = normalizeKey(key);
  if (hypothesis[list].some((row) => row.id !== ignoredId && normalizeKey(row[keyField]) === normalized)) {
    throw new Error(`Le ${label} « ${key} » a déjà une ligne de report dans cette hypothèse.`);
  }
}

// Les électeurs d'un finaliste votent par défaut pour lui : on crée sa ligne dès que la condition est posée.
function ensureFinalistRows(state, hypothesis) {
  for (const [name, side] of [[hypothesis.finalist_a, "a"], [hypothesis.finalist_b, "b"]]) {
    if (!name || hypothesis.candidate_transfers.some((row) => normalizeKey(row.name) === normalizeKey(name))) continue;
    createTransferRowRecord(state, hypothesis, "candidate", {
      key: name,
      pct_to_a: side === "a" ? 100 : 0,
      pct_to_b: side === "b" ? 100 : 0,
    });
  }
}

export const transferHypothesisApi = {
  listElectionTransferHypotheses: async (electionId) => {
    const election = findElection(loadState(), electionId);
    return [...election.transfer_hypotheses]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map(serializeTransferHypothesis);
  },

  getElectionTransferHypothesis: async (electionId, hypothesisId) => {
    const election = findElection(loadState(), electionId);
    return serializeTransferHypothesis(findTransferHypothesis(election, hypothesisId));
  },

  createElectionTransferHypothesis: async (electionId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = createTransferHypothesisRecord(state, election);
    saveState(state);
    return serializeTransferHypothesis(hypothesis);
  },

  updateElectionTransferHypothesis: async (electionId, hypothesisId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findTransferHypothesis(election, hypothesisId);
    withTransferHypothesisSync(state, election, () => {
      if ("name" in payload) {
        const name = (payload.name || "").trim();
        if (name) hypothesis.name = name;
      }
      if ("description" in payload) hypothesis.description = (payload.description || "").trim();
      if ("tag_ids" in payload) {
        const validIds = new Set(election.tags.map((tag) => tag.id));
        hypothesis.tag_ids = [...new Set((payload.tag_ids || []).map(Number))].filter((id) => validIds.has(id));
      }
      if ("finalist_a" in payload || "finalist_b" in payload) {
        const finalistA = "finalist_a" in payload ? String(payload.finalist_a || "").trim() : hypothesis.finalist_a;
        const finalistB = "finalist_b" in payload ? String(payload.finalist_b || "").trim() : hypothesis.finalist_b;
        if (finalistA && finalistB && normalizeKey(finalistA) === normalizeKey(finalistB)) {
          throw new Error("Les deux finalistes doivent être différents.");
        }
        hypothesis.finalist_a = finalistA;
        hypothesis.finalist_b = finalistB;
        ensureFinalistRows(state, hypothesis);
      }
      if ("abstention_to_a" in payload) hypothesis.abstention_to_a = pct(payload.abstention_to_a, hypothesis.abstention_to_a);
      if ("abstention_to_b" in payload) hypothesis.abstention_to_b = pct(payload.abstention_to_b, hypothesis.abstention_to_b);
    });
    saveState(state);
    return serializeTransferHypothesis(hypothesis);
  },

  duplicateElectionTransferHypothesis: async (electionId, hypothesisId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const original = findTransferHypothesis(election, hypothesisId);
    const copy = createTransferHypothesisRecord(state, election, {
      name: `${original.name} (copie)`,
      description: original.description,
      tag_ids: [...original.tag_ids],
      finalist_a: original.finalist_a,
      finalist_b: original.finalist_b,
      abstention_to_a: original.abstention_to_a,
      abstention_to_b: original.abstention_to_b,
    });
    for (const row of original.candidate_transfers) {
      createTransferRowRecord(state, copy, "candidate", { ...row, key: row.name });
    }
    for (const row of original.party_transfers) {
      createTransferRowRecord(state, copy, "party", { ...row, key: row.party });
    }
    saveState(state);
    return serializeTransferHypothesis(copy);
  },

  deleteElectionTransferHypothesis: async (electionId, hypothesisId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findTransferHypothesis(election, hypothesisId);
    // Les scénarios liés conservent leurs valeurs et repassent en Custom.
    for (const simulation of state.simulations.filter((item) => (
      item.election_id === election.id && item.r2_hypothesis_id === hypothesis.id
    ))) {
      simulation.r2_hypothesis_id = null;
    }
    election.transfer_hypotheses = election.transfer_hypotheses.filter((item) => item.id !== hypothesis.id);
    saveState(state);
    return { status: "ok" };
  },

  addTransferHypothesisRow: async (electionId, hypothesisId, kind, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findTransferHypothesis(election, hypothesisId);
    const { label } = rowKind(kind);
    const key = String(payload.key || "").trim();
    if (!key) throw new Error(`Le nom du ${label} est obligatoire.`);
    assertUniqueRowKey(hypothesis, kind, key);
    withTransferHypothesisSync(state, election, () => {
      createTransferRowRecord(state, hypothesis, kind, {
        key,
        pct_to_a: pct(payload.pct_to_a),
        pct_to_b: pct(payload.pct_to_b),
      });
    });
    saveState(state);
    return serializeTransferHypothesis(hypothesis);
  },

  updateTransferHypothesisRow: async (electionId, hypothesisId, kind, rowId, payload) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findTransferHypothesis(election, hypothesisId);
    const { list, key: keyField } = rowKind(kind);
    const row = hypothesis[list].find((item) => item.id === Number(rowId));
    if (!row) throw new Error("Ligne de report introuvable.");
    withTransferHypothesisSync(state, election, () => {
      if ("key" in payload) {
        const key = String(payload.key || "").trim();
        if (key) {
          assertUniqueRowKey(hypothesis, kind, key, row.id);
          row[keyField] = key;
        }
      }
      if ("pct_to_a" in payload) row.pct_to_a = pct(payload.pct_to_a, row.pct_to_a);
      if ("pct_to_b" in payload) row.pct_to_b = pct(payload.pct_to_b, row.pct_to_b);
    });
    saveState(state);
    return serializeTransferHypothesis(hypothesis);
  },

  deleteTransferHypothesisRow: async (electionId, hypothesisId, kind, rowId) => {
    const state = loadState();
    const election = findElection(state, electionId);
    const hypothesis = findTransferHypothesis(election, hypothesisId);
    const { list } = rowKind(kind);
    withTransferHypothesisSync(state, election, () => {
      hypothesis[list] = hypothesis[list].filter((item) => item.id !== Number(rowId));
    });
    saveState(state);
    return serializeTransferHypothesis(hypothesis);
  },
};
