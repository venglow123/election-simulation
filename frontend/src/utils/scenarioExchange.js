import { compressSync, decompressSync, strFromU8, strToU8 } from "fflate";

export const SCENARIO_FORMAT = "report-voix-elections/scenario";
export const SCENARIO_VERSION = 1;
const QR_PREFIX = "RVE1:";
const MAX_QR_TEXT_LENGTH = 10000;

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

function requireNumber(value, label, maximum = 100) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${label} doit être compris entre 0 et ${maximum}.`);
  }
  return value;
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} est invalide.`);
  }
  return value;
}

export function buildScenarioPayload(simulation) {
  return {
    format: SCENARIO_FORMAT,
    version: SCENARIO_VERSION,
    scenario: {
      name: simulation.name,
      description: simulation.description || "",
      total_inscrits: simulation.total_inscrits,
      abstention_r1: simulation.abstention_r1,
      abstention_to_a: simulation.abstention_to_a,
      abstention_to_b: simulation.abstention_to_b,
      candidates: simulation.candidates.map((candidate) => ({
        name: candidate.name,
        pct_r1: candidate.pct_r1,
        pct_to_a: candidate.transfer.pct_to_a,
        pct_to_b: candidate.transfer.pct_to_b,
      })),
    },
  };
}

export function validateScenarioPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Le QR ne contient pas un objet valide.");
  if (payload.format !== SCENARIO_FORMAT) throw new Error("Ce QR ne contient pas un scénario compatible.");
  if (payload.version !== SCENARIO_VERSION) throw new Error("La version de ce scénario n'est pas prise en charge.");

  const scenario = payload.scenario;
  if (!scenario || typeof scenario !== "object") throw new Error("Les données du scénario sont absentes.");
  const name = requireString(scenario.name, "Le nom du scénario", 200);
  if (typeof scenario.description !== "string" || scenario.description.length > 5000) {
    throw new Error("La description du scénario est invalide.");
  }
  const totalInscrits = requireInteger(scenario.total_inscrits, "Le nombre d'inscrits", 0, 2_000_000_000);
  const abstentionR1 = requireInteger(scenario.abstention_r1, "L'abstention du 1er tour", 0, totalInscrits);
  const abstentionToA = requireNumber(scenario.abstention_to_a, "Le report des abstentionnistes vers A");
  const abstentionToB = requireNumber(scenario.abstention_to_b, "Le report des abstentionnistes vers B");
  if (abstentionToA + abstentionToB > 100.000001) {
    throw new Error("Les reports des abstentionnistes dépassent 100%.");
  }
  if (!Array.isArray(scenario.candidates) || scenario.candidates.length > 100) {
    throw new Error("La liste des candidats est invalide.");
  }

  const candidates = scenario.candidates.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`Le candidat ${index + 1} est invalide.`);
    const candidateName = requireString(candidate.name, `Le nom du candidat ${index + 1}`, 200);
    const pctR1 = requireNumber(candidate.pct_r1, `Le pourcentage T1 du candidat ${index + 1}`);
    const pctToA = requireNumber(candidate.pct_to_a, `Le report vers A du candidat ${index + 1}`);
    const pctToB = requireNumber(candidate.pct_to_b, `Le report vers B du candidat ${index + 1}`);
    if (pctToA + pctToB > 100.000001) {
      throw new Error(`Les reports du candidat ${index + 1} dépassent 100%.`);
    }
    return { name: candidateName, pct_r1: pctR1, pct_to_a: pctToA, pct_to_b: pctToB };
  });

  return {
    format: SCENARIO_FORMAT,
    version: SCENARIO_VERSION,
    scenario: {
      name,
      description: scenario.description,
      total_inscrits: totalInscrits,
      abstention_r1: abstentionR1,
      abstention_to_a: abstentionToA,
      abstention_to_b: abstentionToB,
      candidates,
    },
  };
}

export function encodeScenarioPayload(payload) {
  const normalized = validateScenarioPayload(payload);
  const encoded = `${QR_PREFIX}${bytesToBase64(compressSync(strToU8(JSON.stringify(normalized))))}`;
  if (encoded.length > MAX_QR_TEXT_LENGTH) {
    throw new Error("Ce scénario est trop volumineux pour être partagé par QR code.");
  }
  return encoded;
}

export function decodeScenarioPayload(text) {
  if (typeof text !== "string" || !text.startsWith(QR_PREFIX)) {
    throw new Error("Ce QR code ne correspond pas à un scénario partagé.");
  }
  if (text.length > MAX_QR_TEXT_LENGTH) throw new Error("Le QR code est trop volumineux.");
  try {
    return validateScenarioPayload(JSON.parse(strFromU8(decompressSync(base64ToBytes(text.slice(QR_PREFIX.length))))));
  } catch (error) {
    if (error.message.includes("invalide") || error.message.includes("dépasse") || error.message.includes("compatible")) {
      throw error;
    }
    throw new Error("Le contenu du QR code est illisible ou corrompu.");
  }
}
