import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeElectionContent, decodeElectionPayload, encodeElectionContent, validateElectionPayload } from "./electionExchange.js";

const payload = {
  format: "report-voix-elections/election",
  version: 1,
  election: {
    name: "Présidentielle test",
    tags: [{ name: "Sondage", color: "#2563eb" }],
    candidates: [{ name: "Alice", party: "Parti A" }, { name: "Bob", party: "" }],
    hypotheses: [
      {
        name: "Hypothèse haute",
        description: "",
        tags: [0],
        candidates: [{ name: "Alice", pct_r1: 30 }, { name: "Bob", pct_r1: 25 }],
      },
    ],
    transfer_hypotheses: [
      {
        name: "Report standard",
        description: "",
        tags: [],
        finalist_a: "Alice",
        finalist_b: "Bob",
        abstention_to_a: 10,
        abstention_to_b: 20,
        candidate_transfers: [{ name: "Alice", pct_to_a: 100, pct_to_b: 0 }],
        party_transfers: [{ party: "Parti A", pct_to_a: 80, pct_to_b: 10 }],
      },
    ],
    scenarios: [
      {
        name: "Scénario 1",
        description: "",
        total_inscrits: 1000,
        abstention_r1: 100,
        abstention_to_a: 10,
        abstention_to_b: 20,
        r1_hypothesis: 0,
        r1_tags: [],
        r2_tags: [],
        r1_excluded: [1],
        r2_hypothesis: 0,
        candidates: [
          { name: "Alice", pct_r1: 30, pct_to_a: 100, pct_to_b: 0, hypothesis_candidate: 0, r1_name_override: false, r1_pct_override: false },
        ],
      },
    ],
  },
};

test("le contenu encodé est sûr pour une URL et se décode à l'identique", () => {
  const content = encodeElectionContent(payload);
  assert.match(content, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeElectionContent(content), payload);
});

test("un lien de partage est décodé", () => {
  const url = `https://user.github.io/repo/#/import?content=${encodeElectionContent(payload)}`;
  assert.deepEqual(decodeElectionPayload(url), payload);
});

test("un contenu invalide est refusé", () => {
  assert.throws(() => decodeElectionContent("abc<script>"));
  assert.throws(() => decodeElectionPayload("https://example.com/"));
});

test("les références hors limites sont rejetées", () => {
  const broken = structuredClone(payload);
  broken.election.scenarios[0].r1_hypothesis = 5;
  assert.throws(() => validateElectionPayload(broken), /hypothèse de 1er tour/i);
});

test("les tags de section sont optionnels pour les anciens exports et validés par index", () => {
  const legacy = structuredClone(payload);
  delete legacy.election.scenarios[0].r1_tags;
  delete legacy.election.scenarios[0].r2_tags;
  assert.deepEqual(validateElectionPayload(legacy), payload);
  const tagged = structuredClone(payload);
  tagged.election.scenarios[0].r1_tags = [0, 0];
  tagged.election.scenarios[0].r2_tags = [0];
  assert.deepEqual(validateElectionPayload(tagged).election.scenarios[0].r1_tags, [0]);
  tagged.election.scenarios[0].r2_tags = [42];
  assert.throws(() => validateElectionPayload(tagged), /tags des reports/);
});

test("un format étranger est rejeté", () => {
  assert.throws(
    () => validateElectionPayload({ ...payload, format: "report-voix-elections/scenario" }),
    /élection partagée/
  );
});
