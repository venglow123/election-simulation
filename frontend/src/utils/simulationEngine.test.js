import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSankeyData, candidateVotesR1, computeResults, getFinalists } from "./simulationEngine.js";

function makeSimulation(totalInscrits, abstentionR1, candidates, [abstToA, abstToB] = [0, 0]) {
  return {
    id: 1,
    total_inscrits: totalInscrits,
    abstention_r1: abstentionR1,
    abstention_to_a: abstToA,
    abstention_to_b: abstToB,
    candidates: candidates.map(([name, pct_r1, pct_to_a, pct_to_b], index) => ({
      id: index + 1,
      name,
      pct_r1,
      transfer: { pct_to_a, pct_to_b },
    })),
  };
}

const threeCandidates = () =>
  makeSimulation(1000, 100, [["Alice", 60, 80, 10], ["Bob", 30, 20, 70], ["Carla", 10, 0, 50]], [10, 20]);

test("votes du 1er tour et finalistes calculés à partir des votants", () => {
  const sim = makeSimulation(1000, 100, [["Alice", 55, 0, 0], ["Bob", 30, 0, 0], ["Carla", 15, 0, 0]]);
  assert.deepEqual(getFinalists(sim).map((c) => c.name), ["Alice", "Bob"]);
  assert.deepEqual(sim.candidates.map((c) => candidateVotesR1(sim, c)), [495, 270, 135]);
});

test("résultats incluant reports des candidats et remobilisation des abstentionnistes", () => {
  const result = computeResults(threeCandidates());
  assert.equal(result.votes_a, 496);
  assert.equal(result.votes_b, 308);
  assert.equal(result.abstention_r2, 196);
  assert.equal(result.participation_r2, 804);
  assert.equal(result.winner.name, "Alice");
  assert.ok(Math.abs(result.pct_a - (100 * 496) / 804) < 1e-9);
  assert.ok(Math.abs(result.pct_b - (100 * 308) / 804) < 1e-9);
  assert.equal(result.abst_to_a, 10);
  assert.equal(result.abst_to_b, 20);
  assert.equal(result.abst_stay, 70);
});

test("les abstentionnistes non remobilisés restent abstentionnistes", () => {
  const result = computeResults(makeSimulation(1000, 100, [["Alice", 50, 0, 0], ["Bob", 50, 0, 0]], [25, 35]));
  assert.equal(result.votes_a, 25);
  assert.equal(result.votes_b, 35);
  assert.equal(result.abstention_r2, 940);
  assert.equal(result.participation_r2, 60);
});

test("avertissements sur les sommes de pourcentages invalides", () => {
  const result = computeResults(makeSimulation(1000, 100, [["Alice", 60, 80, 30], ["Bob", 30, 0, 0]], [70, 40]));
  assert.equal(result.warnings.length, 3);
  assert.ok(result.warnings.some((w) => w.includes("1er tour")));
  assert.ok(result.warnings.some((w) => w.includes("Alice")));
  assert.ok(result.warnings.some((w) => w.includes("abstentionnistes")));
});

test("pas de 2e tour avec un seul candidat", () => {
  const result = computeResults(makeSimulation(1000, 100, [["Alice", 100, 0, 0]]));
  assert.equal(result.has_finalists, false);
  assert.equal(result.votes_a, undefined);
});

test("les liens du Sankey correspondent aux nœuds du 2e tour", () => {
  const sim = threeCandidates();
  const result = computeResults(sim);
  const sankey = buildSankeyData(sim, result);
  const byTarget = {};
  for (const link of sankey.links) byTarget[link.target] = (byTarget[link.target] || 0) + link.value;

  assert.equal(sankey.nodesLeft.length, 4);
  assert.deepEqual(sankey.nodesRight.map((n) => n.id), ["fa", "fb", "abst2"]);
  assert.equal(byTarget.fa, result.votes_a);
  assert.equal(byTarget.fb, result.votes_b);
  assert.equal(byTarget.abst2, result.abstention_r2);
});
