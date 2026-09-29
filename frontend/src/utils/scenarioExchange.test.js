import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeScenarioContent, decodeScenarioPayload, encodeScenarioContent } from "./scenarioExchange.js";

const payload = {
  format: "report-voix-elections/scenario",
  version: 1,
  scenario: {
    name: "Test",
    description: "",
    total_inscrits: 1000,
    abstention_r1: 100,
    abstention_to_a: 10,
    abstention_to_b: 20,
    candidates: [{ name: "Alice", pct_r1: 60, pct_to_a: 80, pct_to_b: 10 }],
  },
};

test("le contenu encodé est sûr pour une URL et se décode à l'identique", () => {
  const content = encodeScenarioContent(payload);
  assert.match(content, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeScenarioContent(content), payload);
});

test("un lien de partage (texte du QR) est décodé", () => {
  const url = `https://user.github.io/repo/#/import?content=${encodeScenarioContent(payload)}`;
  assert.deepEqual(decodeScenarioPayload(url), payload);
});

test("l'ancien format RVE1: reste lisible", () => {
  assert.deepEqual(decodeScenarioPayload(`RVE1:${encodeScenarioContent(payload)}`), payload);
});

test("un contenu invalide est refusé", () => {
  assert.throws(() => decodeScenarioContent("abc<script>"));
  assert.throws(() => decodeScenarioPayload("https://example.com/"));
});
