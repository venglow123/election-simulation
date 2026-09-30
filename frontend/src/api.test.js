import assert from "node:assert/strict";
import { test } from "node:test";

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  },
};

const { api } = await import("./api.js");

function resetStorage() {
  values.clear();
}

test("les scénarios v1 sont migrés sans perdre leur identité ni leurs données", async () => {
  resetStorage();
  const legacy = {
    nextSimulationId: 8,
    nextCandidateId: 15,
    simulations: [
      {
        id: 7,
        name: "Présidentielle - variante",
        description: "Données historiques",
        position: 3,
        total_inscrits: 1000,
        abstention_r1: 120,
        abstention_to_a: 10,
        abstention_to_b: 20,
        candidates: [{ id: 14, name: "Alice", pct_r1: 60, transfer: { pct_to_a: 80, pct_to_b: 10 } }],
      },
    ],
  };
  values.set("election-simulation:v1", JSON.stringify(legacy));

  const [election] = await api.listElections();
  const [summary] = await api.listSimulations(election.id);
  const simulation = await api.getSimulation(election.id, summary.id);
  const legacyRouteSimulation = await api.getSimulation(summary.id);
  const [candidate] = await api.listElectionCandidates(election.id);

  assert.equal(election.name, "Élection existante");
  assert.equal(summary.id, 7);
  assert.equal(simulation.id, 7);
  assert.equal(legacyRouteSimulation.election_id, election.id);
  assert.equal(simulation.name, "Présidentielle - variante");
  assert.equal(simulation.description, "Données historiques");
  assert.equal(simulation.total_inscrits, 1000);
  assert.deepEqual(simulation.candidates[0].transfer, { pct_to_a: 80, pct_to_b: 10, pct_to_abstention: 10 });
  assert.equal(candidate.name, "Alice");
  assert.equal(values.has("election-simulation:v2"), true);
  assert.equal(values.get("election-simulation:v1"), JSON.stringify(legacy));
});

test("une clé v2 illisible ne masque pas une sauvegarde v1 encore valide", async () => {
  resetStorage();
  values.set("election-simulation:v2", "{");
  values.set("election-simulation:v1", JSON.stringify({
    nextSimulationId: 2,
    nextCandidateId: 1,
    simulations: [{
      id: 1,
      name: "Scénario récupéré",
      position: 1,
      candidates: [],
    }],
  }));

  const [election] = await api.listElections();
  const [simulation] = await api.listSimulations(election.id);

  assert.equal(simulation.name, "Scénario récupéré");
});

test("les scénarios et le référentiel de candidats restent isolés par élection", async () => {
  resetStorage();
  const firstElection = await api.createElection("Municipales");
  const secondElection = await api.createElection("Présidentielle");
  const firstSimulation = await api.createSimulation(firstElection.id, "Hypothèse A");
  const secondSimulation = await api.createSimulation(secondElection.id, "Hypothèse B");
  const { new_candidate_id: candidateId } = await api.addCandidate(firstSimulation.id, { name: "Alice", pct_r1: 55 });
  const [candidate] = await api.listElectionCandidates(firstElection.id);

  await api.updateElectionCandidate(firstElection.id, candidate.id, { name: "Alice Durand", party: "Indépendante" });

  assert.deepEqual((await api.listSimulations(firstElection.id)).map((simulation) => simulation.name), ["Hypothèse A"]);
  assert.deepEqual((await api.listSimulations(secondElection.id)).map((simulation) => simulation.name), ["Hypothèse B"]);
  assert.equal((await api.getSimulation(firstElection.id, firstSimulation.id)).candidates[0].name, "Alice Durand");
  assert.equal((await api.getSimulation(secondElection.id, secondSimulation.id)).candidates.length, 0);
  assert.equal((await api.listElectionCandidates(firstElection.id))[0].party, "Indépendante");
  assert.equal((await api.listElectionCandidates(firstElection.id))[0].usage_count, 1);
  assert.ok(candidateId > 0);
});

test("les hypothèses du premier tour sont isolées, modifiables et dupliquées indépendamment", async () => {
  resetStorage();
  const firstElection = await api.createElection("Municipales");
  const secondElection = await api.createElection("Présidentielle");
  const hypothesis = await api.createElectionHypothesis(firstElection.id);

  await api.updateElectionHypothesis(firstElection.id, hypothesis.id, {
    name: "Sondage de juin",
    description: "Hypothèse de référence",
  });
  const withFirstCandidate = await api.addHypothesisCandidate(firstElection.id, hypothesis.id, {
    name: "Alice",
    pct_r1: 52,
  });
  const firstCandidate = withFirstCandidate.candidates[0];
  const withSecondCandidate = await api.addHypothesisCandidate(firstElection.id, hypothesis.id, {
    name: "Benoît",
    pct_r1: 48,
  });
  const copy = await api.duplicateElectionHypothesis(firstElection.id, hypothesis.id);

  await api.updateHypothesisCandidate(firstElection.id, hypothesis.id, firstCandidate.id, { pct_r1: 60 });
  const updated = await api.getElectionHypothesis(firstElection.id, hypothesis.id);

  assert.equal(updated.name, "Sondage de juin");
  assert.equal(updated.description, "Hypothèse de référence");
  assert.equal(updated.candidates[0].pct_r1, 60);
  assert.equal(withSecondCandidate.candidates.length, 2);
  assert.notEqual(copy.id, hypothesis.id);
  assert.notEqual(copy.candidates[0].id, firstCandidate.id);
  assert.equal(copy.candidates[0].pct_r1, 52);
  assert.equal((await api.listElectionHypotheses(secondElection.id)).length, 0);

  const [aliceReference] = await api.listElectionCandidates(firstElection.id);
  await api.updateElectionCandidate(firstElection.id, aliceReference.id, { name: "Alice Martin" });
  assert.equal((await api.getElectionHypothesis(firstElection.id, hypothesis.id)).candidates[0].name, "Alice Martin");
  const [renamedReference] = await api.listElectionCandidates(firstElection.id);
  await api.deleteElectionCandidate(firstElection.id, renamedReference.id);
  assert.equal((await api.getElectionHypothesis(firstElection.id, hypothesis.id)).candidates[0].name, "Alice Martin");

  await api.deleteHypothesisCandidate(firstElection.id, hypothesis.id, firstCandidate.id);
  assert.equal((await api.getElectionHypothesis(firstElection.id, hypothesis.id)).candidates.length, 1);
  await api.deleteElectionHypothesis(firstElection.id, hypothesis.id);
  assert.equal((await api.listElectionHypotheses(firstElection.id)).length, 1);
});

test("les changements d'une hypothèse alimentent ses scénarios liés sans écraser les personnalisations locales", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const hypothesis = await api.createElectionHypothesis(election.id);
  const { candidates } = await api.addHypothesisCandidate(election.id, hypothesis.id, {
    name: "Alice",
    pct_r1: 55,
  });
  const second = await api.addHypothesisCandidate(election.id, hypothesis.id, {
    name: "Benoît",
    pct_r1: 45,
  });
  const simulation = await api.createSimulation(election.id, "Scénario lié");

  let selected = await api.setSimulationFirstRoundHypothesis(election.id, simulation.id, hypothesis.id);
  const [alice] = selected.candidates;
  assert.equal(selected.r1_hypothesis_id, hypothesis.id);
  assert.equal(alice.name, "Alice");
  assert.equal(alice.pct_r1, 55);

  await api.updateCandidate(simulation.id, alice.id, { pct_r1: 60 });
  await api.updateHypothesisCandidate(election.id, hypothesis.id, candidates[0].id, { pct_r1: 58 });
  await api.updateHypothesisCandidate(election.id, hypothesis.id, second.candidates[1].id, { pct_r1: 42 });
  let updated = await api.getSimulation(election.id, simulation.id);
  assert.equal(updated.candidates[0].pct_r1, 60);
  assert.equal(updated.candidates[1].pct_r1, 42);

  const withThirdCandidate = await api.addHypothesisCandidate(election.id, hypothesis.id, {
    name: "Chloé",
    pct_r1: 3,
  });
  let linkedSimulation = await api.getSimulation(election.id, simulation.id);
  assert.equal(linkedSimulation.candidates.length, 3);
  const localChloe = linkedSimulation.candidates[2];
  await api.deleteCandidate(simulation.id, localChloe.id);
  await api.updateHypothesisCandidate(election.id, hypothesis.id, withThirdCandidate.candidates[2].id, { pct_r1: 5 });
  linkedSimulation = await api.getSimulation(election.id, simulation.id);
  assert.equal(linkedSimulation.candidates.length, 2);

  updated = await api.resetSimulationFirstRoundHypothesis(election.id, simulation.id);
  assert.deepEqual(updated.candidates.map((candidate) => candidate.pct_r1), [58, 42, 5]);

  const custom = await api.setSimulationFirstRoundHypothesis(election.id, simulation.id, null);
  assert.equal(custom.r1_hypothesis_id, null);
  assert.deepEqual(custom.candidates.map((candidate) => candidate.pct_r1), [58, 42, 5]);

  const saved = await api.saveSimulationAsFirstRoundHypothesis(election.id, simulation.id, custom.candidates);
  assert.equal(saved.hypothesis.candidates.length, 3);
  assert.equal(saved.simulation.r1_hypothesis_id, saved.hypothesis.id);
  assert.deepEqual(saved.hypothesis.candidates.map((candidate) => candidate.pct_r1), [58, 42, 5]);
});

test("les tags d'hypothèses sont administrables par élection et suivent les hypothèses", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const other = await api.createElection("Présidentielle");
  const left = await api.createElectionTag(election.id, { name: "Gauche unie" });
  const right = await api.createElectionTag(election.id, { name: "Droite", color: "#AABBCC" });

  assert.match(left.color, /^#[0-9a-f]{6}$/);
  assert.notEqual(left.color, right.color);
  assert.equal(right.color, "#aabbcc");
  await assert.rejects(api.createElectionTag(election.id, { name: "gauche UNIE" }), /existe déjà/);
  assert.equal((await api.listElectionTags(other.id)).length, 0);

  const hypothesis = await api.createElectionHypothesis(election.id);
  const tagged = await api.updateElectionHypothesis(election.id, hypothesis.id, {
    tag_ids: [left.id, right.id, left.id, 999],
  });
  assert.deepEqual(tagged.tag_ids, [left.id, right.id]);
  const copy = await api.duplicateElectionHypothesis(election.id, hypothesis.id);
  assert.deepEqual(copy.tag_ids, [left.id, right.id]);

  const renamed = await api.updateElectionTag(election.id, left.id, { name: "Gauche", color: "#112233" });
  assert.deepEqual(renamed.map((tag) => [tag.name, tag.usage_count]), [["Droite", 2], ["Gauche", 2]]);
  await assert.rejects(api.updateElectionTag(election.id, left.id, { name: "droite" }), /existe déjà/);

  await api.deleteElectionTag(election.id, right.id);
  assert.deepEqual((await api.getElectionHypothesis(election.id, copy.id)).tag_ids, [left.id]);
});

test("les opérations de simulation conservent leur contrat via la façade API", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const simulation = await api.createSimulation(election.id, "Initiale");
  const { new_candidate_id: candidateId } = await api.addCandidate(simulation.id, { name: "Alice", pct_r1: 55 });
  await api.updateTransfer(simulation.id, candidateId, { pct_to_a: 70, pct_to_b: 20 });
  await api.updateAbstentionTransfer(simulation.id, { pct_to_a: 10 });
  const copy = await api.duplicateSimulation(simulation.id);

  assert.equal(copy.candidates[0].transfer.pct_to_a, 70);
  assert.equal(copy.abstention_to_a, 10);
  await api.reorderSimulations(election.id, [copy.id, simulation.id]);
  assert.deepEqual((await api.listSimulations(election.id)).map((item) => item.id), [copy.id, simulation.id]);
  await api.deleteSimulation(simulation.id);
  assert.deepEqual((await api.listSimulations(election.id)).map((item) => item.id), [copy.id]);
});