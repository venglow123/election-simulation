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