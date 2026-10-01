import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPartyIndex, computeTransferBaseline, transferConditionMatches } from "./transferHypothesis.js";

const hypothesis = {
  finalist_a: "Alice",
  finalist_b: "Benoît",
  abstention_to_a: 5,
  abstention_to_b: 10,
  candidate_transfers: [
    { id: 1, name: "Alice", pct_to_a: 100, pct_to_b: 0 },
    { id: 2, name: "Benoît", pct_to_a: 0, pct_to_b: 100 },
    { id: 3, name: "Chloé", pct_to_a: 70, pct_to_b: 10 },
  ],
  party_transfers: [{ id: 4, party: "Verts", pct_to_a: 60, pct_to_b: 20 }],
};

const partyByName = buildPartyIndex([
  { name: "Chloé", party: "Verts" },
  { name: "David", party: "verts" },
  { name: "Émile", party: "Autre" },
]);

test("la condition d'une hypothèse de report ignore l'ordre des finalistes", () => {
  assert.equal(transferConditionMatches(hypothesis, ["Benoît", "Alice"]), true);
  assert.equal(transferConditionMatches(hypothesis, ["Alice", "Chloé"]), false);
  assert.equal(transferConditionMatches({ ...hypothesis, finalist_b: "" }, ["Alice", ""]), false);
});

test("la matrice candidats prime sur la matrice partis, les lignes non couvertes vont à l'abstention", () => {
  const candidates = [
    { id: 11, name: "Alice" },
    { id: 12, name: "Benoît" },
    { id: 13, name: "Chloé" },
    { id: 14, name: "David" },
    { id: 15, name: "Émile" },
    { id: 16, name: "Inconnu" },
  ];
  const baseline = computeTransferBaseline(hypothesis, { finalistA: "Alice", finalistB: "Benoît", candidates, partyByName });

  assert.deepEqual(baseline.abstention, { pct_to_a: 5, pct_to_b: 10 });
  assert.deepEqual(baseline.rows.get(13), { pct_to_a: 70, pct_to_b: 10, source: "candidate" });
  assert.deepEqual(baseline.rows.get(14), { pct_to_a: 60, pct_to_b: 20, source: "party", party: "Verts" });
  assert.deepEqual(baseline.rows.get(15), { pct_to_a: 0, pct_to_b: 0, source: "none", party: "Autre" });
  assert.deepEqual(baseline.rows.get(16), { pct_to_a: 0, pct_to_b: 0, source: "none", party: "" });
});

test("les colonnes sont inversées quand les finalistes du scénario sont dans l'autre ordre", () => {
  const baseline = computeTransferBaseline(hypothesis, {
    finalistA: "Benoît",
    finalistB: "Alice",
    candidates: [{ id: 1, name: "Chloé" }],
    partyByName,
  });
  assert.deepEqual(baseline.abstention, { pct_to_a: 10, pct_to_b: 5 });
  assert.deepEqual(baseline.rows.get(1), { pct_to_a: 10, pct_to_b: 70, source: "candidate" });
  assert.equal(computeTransferBaseline(hypothesis, { finalistA: "Alice", finalistB: "Chloé", candidates: [], partyByName }), null);
});
