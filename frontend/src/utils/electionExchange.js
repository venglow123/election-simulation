import { compressSync, decompressSync, strFromU8, strToU8 } from "fflate";
import { isValidTagColor, TAG_PALETTE } from "./tags.js";

export const ELECTION_FORMAT = "report-voix-elections/election";
export const ELECTION_VERSION = 1;

// Un QR code ne peut pas dépasser ~2900 caractères : au-delà, seul le lien (ou le fichier) est utilisable.
export const MAX_QR_CONTENT_LENGTH = 2200;
const MAX_CONTENT_LENGTH = 400_000;

const LIMITS = {
  tags: 200,
  candidates: 1000,
  hypotheses: 300,
  transferHypotheses: 300,
  scenarios: 500,
  rows: 1000,
};

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function requireString(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} est invalide.`);
  }
  return value.trim();
}

function optionalString(value, label, maxLength) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > maxLength) throw new Error(`${label} est invalide.`);
  return value.trim();
}

function requirePct(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} doit être compris entre 0 et 100.`);
  }
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} est invalide.`);
  }
  return value;
}

function requireArray(value, label, maxLength) {
  if (!Array.isArray(value) || value.length > maxLength) throw new Error(`${label} est invalide.`);
  return value;
}

function requireIndex(value, length, label) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value >= length) throw new Error(`${label} est invalide.`);
  return value;
}

function sortByPosition(a, b) {
  return a.position - b.position || a.id - b.id;
}

export function buildElectionPayload(election, simulations) {
  const tagIndexById = new Map(election.tags.map((tag, index) => [tag.id, index]));
  const hypotheses = [...election.hypotheses].sort(sortByPosition);
  const hypothesisIndexById = new Map(hypotheses.map((hypothesis, index) => [hypothesis.id, index]));
  // Les candidats d'hypothèse sont référencés par leur rang dans l'hypothèse de 1er tour du scénario.
  const hypothesisCandidateIndexById = new Map();
  for (const hypothesis of hypotheses) {
    hypothesis.candidates.forEach((candidate, index) => hypothesisCandidateIndexById.set(candidate.id, index));
  }
  const transferHypotheses = [...election.transfer_hypotheses].sort(sortByPosition);
  const transferIndexById = new Map(transferHypotheses.map((hypothesis, index) => [hypothesis.id, index]));
  const toTagIndexes = (ids) => ids.map((id) => tagIndexById.get(id)).filter((index) => index != null);

  return {
    format: ELECTION_FORMAT,
    version: ELECTION_VERSION,
    election: {
      name: election.name,
      ...(isValidTagColor(election.abstention_color) ? { abstention_color: election.abstention_color } : {}),
      tags: election.tags.map((tag) => ({ name: tag.name, color: tag.color })),
      candidates: election.candidates.map((candidate) => ({
        name: candidate.name,
        party: candidate.party || "",
        ...(isValidTagColor(candidate.color) ? { color: candidate.color } : {}),
      })),
      hypotheses: hypotheses.map((hypothesis) => ({
        name: hypothesis.name,
        description: hypothesis.description || "",
        tags: toTagIndexes(hypothesis.tag_ids),
        candidates: hypothesis.candidates.map((candidate) => ({ name: candidate.name, pct_r1: candidate.pct_r1 })),
      })),
      transfer_hypotheses: transferHypotheses.map((hypothesis) => ({
        name: hypothesis.name,
        description: hypothesis.description || "",
        tags: toTagIndexes(hypothesis.tag_ids),
        finalist_a: hypothesis.finalist_a || "",
        finalist_b: hypothesis.finalist_b || "",
        abstention_to_a: hypothesis.abstention_to_a,
        abstention_to_b: hypothesis.abstention_to_b,
        candidate_transfers: hypothesis.candidate_transfers.map((row) => ({
          name: row.name,
          pct_to_a: row.pct_to_a,
          pct_to_b: row.pct_to_b,
        })),
        party_transfers: hypothesis.party_transfers.map((row) => ({
          party: row.party,
          pct_to_a: row.pct_to_a,
          pct_to_b: row.pct_to_b,
        })),
      })),
      scenarios: [...simulations].sort(sortByPosition).map((simulation) => {
        const r1Hypothesis = hypothesisIndexById.get(simulation.r1_hypothesis_id) ?? null;
        return {
          name: simulation.name,
          description: simulation.description || "",
          total_inscrits: simulation.total_inscrits,
          abstention_r1: simulation.abstention_r1,
          abstention_to_a: simulation.abstention_to_a,
          abstention_to_b: simulation.abstention_to_b,
          r1_hypothesis: r1Hypothesis,
          r1_tags: toTagIndexes(simulation.r1_tag_ids || []),
          r2_tags: toTagIndexes(simulation.r2_tag_ids || []),
          r1_excluded: r1Hypothesis == null
            ? []
            : simulation.r1_excluded_hypothesis_candidate_ids
              .map((id) => hypothesisCandidateIndexById.get(id))
              .filter((index) => index != null),
          r2_hypothesis: transferIndexById.get(simulation.r2_hypothesis_id) ?? null,
          candidates: simulation.candidates.map((candidate) => ({
            name: candidate.name,
            pct_r1: candidate.pct_r1,
            pct_to_a: candidate.transfer.pct_to_a,
            pct_to_b: candidate.transfer.pct_to_b,
            hypothesis_candidate: r1Hypothesis == null
              ? null
              : hypothesisCandidateIndexById.get(candidate.hypothesis_candidate_id) ?? null,
            r1_name_override: Boolean(candidate.r1_name_override),
            r1_pct_override: Boolean(candidate.r1_pct_override),
          })),
        };
      }),
    },
  };
}

function validateTransferRow(row, keyField, label, index) {
  if (!row || typeof row !== "object") throw new Error(`La ligne de report ${index + 1} de ${label} est invalide.`);
  return {
    [keyField]: requireString(row[keyField], `Le libellé de la ligne de report ${index + 1} de ${label}`, 200),
    pct_to_a: requirePct(row.pct_to_a, `Le report vers A de la ligne ${index + 1} de ${label}`),
    pct_to_b: requirePct(row.pct_to_b, `Le report vers B de la ligne ${index + 1} de ${label}`),
  };
}

export function validateElectionPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Le contenu partagé n'est pas un objet valide.");
  if (payload.format !== ELECTION_FORMAT) throw new Error("Ce contenu ne correspond pas à une élection partagée.");
  if (payload.version !== ELECTION_VERSION) throw new Error("La version de cette élection n'est pas prise en charge.");

  const source = payload.election;
  if (!source || typeof source !== "object") throw new Error("Les données de l'élection sont absentes.");
  const name = requireString(source.name, "Le nom de l'élection", 200);

  const tags = requireArray(source.tags ?? [], "La liste des tags", LIMITS.tags).map((tag, index) => {
    if (!tag || typeof tag !== "object") throw new Error(`Le tag ${index + 1} est invalide.`);
    return {
      name: requireString(tag.name, `Le nom du tag ${index + 1}`, 100),
      color: isValidTagColor(tag.color) ? tag.color.toLowerCase() : TAG_PALETTE[index % TAG_PALETTE.length],
    };
  });

  const candidates = requireArray(source.candidates ?? [], "La liste des candidats", LIMITS.candidates)
    .map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") throw new Error(`Le candidat ${index + 1} est invalide.`);
      return {
        name: requireString(candidate.name, `Le nom du candidat ${index + 1}`, 200),
        party: optionalString(candidate.party, `Le parti du candidat ${index + 1}`, 200),
        ...(isValidTagColor(candidate.color) ? { color: candidate.color.toLowerCase() } : {}),
      };
    });

  const toTags = (value, label) => [
    ...new Set(requireArray(value ?? [], label, LIMITS.tags).map((index) => requireIndex(index, tags.length, label))),
  ].filter((index) => index != null);

  const hypotheses = requireArray(source.hypotheses ?? [], "La liste des hypothèses", LIMITS.hypotheses)
    .map((hypothesis, index) => {
      if (!hypothesis || typeof hypothesis !== "object") throw new Error(`L'hypothèse ${index + 1} est invalide.`);
      return {
        name: requireString(hypothesis.name, `Le nom de l'hypothèse ${index + 1}`, 200),
        description: optionalString(hypothesis.description, `La description de l'hypothèse ${index + 1}`, 5000),
        tags: toTags(hypothesis.tags, `Les tags de l'hypothèse ${index + 1}`),
        candidates: requireArray(hypothesis.candidates ?? [], `Les candidats de l'hypothèse ${index + 1}`, LIMITS.rows)
          .map((candidate, candidateIndex) => {
            if (!candidate || typeof candidate !== "object") {
              throw new Error(`Le candidat ${candidateIndex + 1} de l'hypothèse ${index + 1} est invalide.`);
            }
            return {
              name: requireString(candidate.name, `Le nom du candidat ${candidateIndex + 1} de l'hypothèse ${index + 1}`, 200),
              pct_r1: requirePct(candidate.pct_r1, `Le pourcentage T1 du candidat ${candidateIndex + 1} de l'hypothèse ${index + 1}`),
            };
          }),
      };
    });

  const transferHypotheses = requireArray(
    source.transfer_hypotheses ?? [],
    "La liste des hypothèses de report",
    LIMITS.transferHypotheses
  ).map((hypothesis, index) => {
    if (!hypothesis || typeof hypothesis !== "object") throw new Error(`L'hypothèse de report ${index + 1} est invalide.`);
    const label = `l'hypothèse de report ${index + 1}`;
    return {
      name: requireString(hypothesis.name, `Le nom de ${label}`, 200),
      description: optionalString(hypothesis.description, `La description de ${label}`, 5000),
      tags: toTags(hypothesis.tags, `Les tags de ${label}`),
      finalist_a: optionalString(hypothesis.finalist_a, `Le finaliste A de ${label}`, 200),
      finalist_b: optionalString(hypothesis.finalist_b, `Le finaliste B de ${label}`, 200),
      abstention_to_a: requirePct(hypothesis.abstention_to_a, `Le report des abstentionnistes vers A de ${label}`),
      abstention_to_b: requirePct(hypothesis.abstention_to_b, `Le report des abstentionnistes vers B de ${label}`),
      candidate_transfers: requireArray(hypothesis.candidate_transfers ?? [], `Les reports par candidat de ${label}`, LIMITS.rows)
        .map((row, rowIndex) => validateTransferRow(row, "name", label, rowIndex)),
      party_transfers: requireArray(hypothesis.party_transfers ?? [], `Les reports par parti de ${label}`, LIMITS.rows)
        .map((row, rowIndex) => validateTransferRow(row, "party", label, rowIndex)),
    };
  });

  const scenarios = requireArray(source.scenarios ?? [], "La liste des scénarios", LIMITS.scenarios)
    .map((scenario, index) => {
      if (!scenario || typeof scenario !== "object") throw new Error(`Le scénario ${index + 1} est invalide.`);
      const label = `le scénario ${index + 1}`;
      const totalInscrits = requireInteger(scenario.total_inscrits, `Le nombre d'inscrits de ${label}`, 0, 2_000_000_000);
      const r1Hypothesis = requireIndex(scenario.r1_hypothesis, hypotheses.length, `L'hypothèse de 1er tour de ${label}`);
      const hypothesisCandidatesCount = r1Hypothesis == null ? 0 : hypotheses[r1Hypothesis].candidates.length;
      return {
        name: requireString(scenario.name, `Le nom de ${label}`, 200),
        description: optionalString(scenario.description, `La description de ${label}`, 5000),
        total_inscrits: totalInscrits,
        abstention_r1: requireInteger(scenario.abstention_r1, `L'abstention du 1er tour de ${label}`, 0, totalInscrits),
        abstention_to_a: requirePct(scenario.abstention_to_a, `Le report des abstentionnistes vers A de ${label}`),
        abstention_to_b: requirePct(scenario.abstention_to_b, `Le report des abstentionnistes vers B de ${label}`),
        r1_hypothesis: r1Hypothesis,
        r1_tags: toTags(scenario.r1_tags, `Les tags du premier tour de ${label}`),
        r2_tags: toTags(scenario.r2_tags, `Les tags des reports de ${label}`),
        r1_excluded: [...new Set(
          requireArray(scenario.r1_excluded ?? [], `Les candidats exclus de ${label}`, LIMITS.rows)
            .map((value) => requireIndex(value, hypothesisCandidatesCount, `Un candidat exclu de ${label}`))
        )].filter((value) => value != null),
        r2_hypothesis: requireIndex(scenario.r2_hypothesis, transferHypotheses.length, `L'hypothèse de report de ${label}`),
        candidates: requireArray(scenario.candidates ?? [], `Les candidats de ${label}`, LIMITS.rows)
          .map((candidate, candidateIndex) => {
            if (!candidate || typeof candidate !== "object") {
              throw new Error(`Le candidat ${candidateIndex + 1} de ${label} est invalide.`);
            }
            const candidateLabel = `du candidat ${candidateIndex + 1} de ${label}`;
            return {
              name: requireString(candidate.name, `Le nom ${candidateLabel}`, 200),
              pct_r1: requirePct(candidate.pct_r1, `Le pourcentage T1 ${candidateLabel}`),
              pct_to_a: requirePct(candidate.pct_to_a, `Le report vers A ${candidateLabel}`),
              pct_to_b: requirePct(candidate.pct_to_b, `Le report vers B ${candidateLabel}`),
              hypothesis_candidate: requireIndex(
                candidate.hypothesis_candidate,
                hypothesisCandidatesCount,
                `Le candidat d'hypothèse ${candidateLabel}`
              ),
              r1_name_override: Boolean(candidate.r1_name_override),
              r1_pct_override: Boolean(candidate.r1_pct_override),
            };
          }),
      };
    });

  return {
    format: ELECTION_FORMAT,
    version: ELECTION_VERSION,
    election: {
      name,
      ...(isValidTagColor(source.abstention_color) ? { abstention_color: source.abstention_color.toLowerCase() } : {}),
      tags,
      candidates,
      hypotheses,
      transfer_hypotheses: transferHypotheses,
      scenarios,
    },
  };
}

export function encodeElectionContent(payload) {
  const normalized = validateElectionPayload(payload);
  const content = bytesToBase64(compressSync(strToU8(JSON.stringify(normalized))));
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error("Cette élection est trop volumineuse pour être partagée.");
  }
  return content;
}

// Lien absolu vers la route d'import de cette instance (fonctionne aussi sous /<repo>/ sur GitHub Pages).
export function buildShareUrl(payload) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/import?content=${encodeElectionContent(payload)}`;
}

export function decodeElectionContent(content) {
  if (typeof content !== "string" || !content) throw new Error("Le lien de partage ne contient aucune élection.");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error("Le contenu partagé est trop volumineux.");
  if (!/^[A-Za-z0-9_-]+$/.test(content)) throw new Error("Le contenu partagé est illisible ou corrompu.");
  try {
    return validateElectionPayload(JSON.parse(strFromU8(decompressSync(base64ToBytes(content)))));
  } catch (error) {
    if (/invalide|dépasse|compris entre|absentes|correspond pas|prise en charge|volumineu/.test(error.message)) {
      throw error;
    }
    throw new Error("Le contenu partagé est illisible ou corrompu.");
  }
}

// Accepte un lien de partage complet (texte du QR ou lien collé).
export function decodeElectionPayload(text) {
  if (typeof text !== "string") throw new Error("Ce contenu ne correspond pas à une élection partagée.");
  const match = text.trim().match(/#\/import\?(.*)$/);
  if (!match) throw new Error("Ce contenu ne correspond pas à une élection partagée.");
  return decodeElectionContent(new URLSearchParams(match[1]).get("content"));
}
