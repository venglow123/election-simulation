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
const { transferConditionMatches } = await import("./utils/transferHypothesis.js");

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

test("les reports suivent leur finaliste quand l'ordre du 1er tour s'inverse", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const simulation = await api.createSimulation(election.id, "Inversion");
  const ids = {};
  for (const [name, pct_r1] of [["Alice", 40], ["Benoît", 35], ["Chloé", 25]]) {
    ids[name] = (await api.addCandidate(simulation.id, { name, pct_r1 })).new_candidate_id;
  }
  await api.updateTransfer(simulation.id, ids.Chloé, { pct_to_a: 70, pct_to_b: 10 });
  await api.updateAbstentionTransfer(simulation.id, { pct_to_a: 5, pct_to_b: 15 });

  let scenario = await api.updateCandidate(simulation.id, ids.Benoît, { pct_r1: 45 });
  const chloe = (data) => data.candidates.find((c) => c.id === ids.Chloé).transfer;
  assert.equal(scenario.finalist_a.name, "Benoît");
  assert.deepEqual([chloe(scenario).pct_to_a, chloe(scenario).pct_to_b], [10, 70]);
  assert.deepEqual([scenario.abstention_to_a, scenario.abstention_to_b], [15, 5]);

  // Alice passe 3e : Benoît reste en colonne A, aucune inversion.
  scenario = await api.updateCandidate(simulation.id, ids.Alice, { pct_r1: 10 });
  assert.equal(scenario.finalist_b.name, "Chloé");
  assert.deepEqual([scenario.abstention_to_a, scenario.abstention_to_b], [15, 5]);

  // Le nouvel ajouté prend la tête : Benoît passe en colonne B et ses reports le suivent.
  scenario = await api.addCandidate(simulation.id, { name: "David", pct_r1: 60 });
  assert.equal(scenario.finalist_a.name, "David");
  assert.deepEqual([scenario.abstention_to_a, scenario.abstention_to_b], [5, 15]);
});

test("une hypothèse de report est proposée et appliquée à l'identique quel que soit l'ordre des finalistes", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const hypothesis = await api.createElectionTransferHypothesis(election.id);
  await api.updateElectionTransferHypothesis(election.id, hypothesis.id, {
    finalist_a: "Alice", finalist_b: "Benoît", abstention_to_a: 5, abstention_to_b: 15,
  });
  await api.addTransferHypothesisRow(election.id, hypothesis.id, "candidate", { key: "Chloé", pct_to_a: 70, pct_to_b: 10 });
  const stored = await api.getElectionTransferHypothesis(election.id, hypothesis.id);

  for (const [order, expectedA] of [[[["Alice", 40], ["Benoît", 35]], "Alice"], [[["Benoît", 40], ["Alice", 35]], "Benoît"]]) {
    const simulation = await api.createSimulation(election.id, `Ordre ${expectedA}`);
    for (const [name, pct_r1] of [...order, ["Chloé", 25]]) await api.addCandidate(simulation.id, { name, pct_r1 });
    const before = await api.getSimulation(election.id, simulation.id);
    assert.equal(before.finalist_a.name, expectedA);
    assert.equal(transferConditionMatches(stored, [before.finalist_a.name, before.finalist_b.name]), true);

    const scenario = await api.setSimulationTransferHypothesis(election.id, simulation.id, hypothesis.id);
    const toFinalist = (transfer, name) => (scenario.finalist_a.name === name ? transfer.pct_to_a : transfer.pct_to_b);
    const chloe = scenario.candidates.find((c) => c.name === "Chloé").transfer;
    const abstention = { pct_to_a: scenario.abstention_to_a, pct_to_b: scenario.abstention_to_b };
    assert.equal(toFinalist(chloe, "Alice"), 70);
    assert.equal(toFinalist(chloe, "Benoît"), 10);
    assert.equal(toFinalist(abstention, "Alice"), 5);
    assert.equal(toFinalist(abstention, "Benoît"), 15);
  }
});

test("les hypothèses de report préremplissent le 2e tour et suivent leurs modifications", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  await api.createElectionCandidate(election.id, { name: "Chloé", party: "Verts" });
  await api.createElectionCandidate(election.id, { name: "David", party: "Verts" });
  const simulation = await api.createSimulation(election.id, "Duel");
  for (const [name, pct_r1] of [["Alice", 40], ["Benoît", 35], ["Chloé", 15], ["David", 6], ["Émile", 4]]) {
    await api.addCandidate(simulation.id, { name, pct_r1 });
  }
  const tag = await api.createElectionTag(election.id, { name: "Sondage" });

  const hypothesis = await api.createElectionTransferHypothesis(election.id);
  await assert.rejects(
    api.updateElectionTransferHypothesis(election.id, hypothesis.id, { finalist_a: "Alice", finalist_b: "Alice" }),
    /différents/
  );
  let updated = await api.updateElectionTransferHypothesis(election.id, hypothesis.id, {
    finalist_a: "Benoît",
    finalist_b: "Alice",
    abstention_to_a: 4,
    tag_ids: [tag.id],
  });
  assert.deepEqual(updated.candidate_transfers.map((row) => [row.name, row.pct_to_a, row.pct_to_b]), [
    ["Benoît", 100, 0],
    ["Alice", 0, 100],
  ]);
  updated = await api.addTransferHypothesisRow(election.id, hypothesis.id, "candidate", { key: "Chloé", pct_to_a: 20, pct_to_b: 60 });
  await assert.rejects(api.addTransferHypothesisRow(election.id, hypothesis.id, "candidate", { key: "chloé" }), /déjà/);
  updated = await api.addTransferHypothesisRow(election.id, hypothesis.id, "party", { key: "Verts", pct_to_a: 10, pct_to_b: 50 });
  const partyRowId = updated.party_transfers[0].id;
  assert.equal((await api.listElectionTags(election.id))[0].usage_count, 1);

  let scenario = await api.setSimulationTransferHypothesis(election.id, simulation.id, hypothesis.id);
  const byName = (data) => Object.fromEntries(data.candidates.map((c) => [c.name, [c.transfer.pct_to_a, c.transfer.pct_to_b]]));
  assert.equal(scenario.r2_hypothesis_id, hypothesis.id);
  // Scénario : A = Alice, B = Benoît ; l'hypothèse est définie dans l'ordre inverse.
  assert.deepEqual(byName(scenario), {
    Alice: [100, 0],
    Benoît: [0, 100],
    Chloé: [60, 20],
    David: [50, 10],
    Émile: [0, 0],
  });
  assert.equal(scenario.abstention_to_b, 4);

  const david = scenario.candidates.find((c) => c.name === "David");
  await api.updateTransfer(simulation.id, david.id, { pct_to_a: 30 });
  await api.updateTransferHypothesisRow(election.id, hypothesis.id, "party", partyRowId, { pct_to_a: 25 });
  await api.addTransferHypothesisRow(election.id, hypothesis.id, "candidate", { key: "Émile", pct_to_a: 50, pct_to_b: 0 });
  scenario = await api.getSimulation(election.id, simulation.id);
  assert.deepEqual(byName(scenario).David, [30, 10]);
  assert.deepEqual(byName(scenario).Émile, [0, 50]);

  const withFelix = await api.addCandidate(simulation.id, { name: "Félix", pct_r1: 0 });
  assert.deepEqual(byName(withFelix).Félix, [0, 0]);

  scenario = await api.resetSimulationTransferHypothesis(election.id, simulation.id);
  assert.deepEqual(byName(scenario).David, [50, 25]);

  const copy = await api.duplicateElectionTransferHypothesis(election.id, hypothesis.id);
  assert.equal(copy.party_transfers.length, 1);
  assert.notEqual(copy.party_transfers[0].id, partyRowId);

  const saved = await api.saveSimulationAsTransferHypothesis(election.id, simulation.id);
  assert.equal(saved.hypothesis.finalist_a, "Alice");
  assert.equal(saved.hypothesis.candidate_transfers.length, 6);
  assert.equal(saved.simulation.r2_hypothesis_id, saved.hypothesis.id);

  await api.deleteElectionTransferHypothesis(election.id, saved.hypothesis.id);
  scenario = await api.getSimulation(election.id, simulation.id);
  assert.equal(scenario.r2_hypothesis_id, null);
  assert.deepEqual(byName(scenario).David, [50, 25]);
});

test("une élection exportée est réimportée comme copie indépendante et complète", async () => {
  resetStorage();
  const source = await api.createElection("Présidentielle");
  await api.createElectionCandidate(source.id, { name: "Alice", party: "Parti A" });
  await api.createElectionCandidate(source.id, { name: "Benoît", party: "Parti B" });
  const tag = await api.createElectionTag(source.id, { name: "Sondage" });

  const hypothesis = await api.createElectionHypothesis(source.id);
  await api.updateElectionHypothesis(source.id, hypothesis.id, { name: "Haute", tag_ids: [tag.id] });
  await api.addHypothesisCandidate(source.id, hypothesis.id, { name: "Alice", pct_r1: 40 });
  await api.addHypothesisCandidate(source.id, hypothesis.id, { name: "Benoît", pct_r1: 35 });

  const transfer = await api.createElectionTransferHypothesis(source.id);
  await api.updateElectionTransferHypothesis(source.id, transfer.id, {
    name: "Report standard", finalist_a: "Alice", finalist_b: "Benoît", abstention_to_a: 5, abstention_to_b: 15,
  });

  const simulation = await api.createSimulation(source.id, "Scénario central");
  await api.setSimulationFirstRoundHypothesis(source.id, simulation.id, hypothesis.id);
  await api.setSimulationTransferHypothesis(source.id, simulation.id, transfer.id);

  const imported = await api.importElection(await api.exportElection(source.id));
  assert.notEqual(imported.id, source.id);
  assert.match(imported.name, /^Présidentielle \(\d{6}\)$/);

  const [importedHypothesis] = await api.listElectionHypotheses(imported.id);
  const [importedTransfer] = await api.listElectionTransferHypotheses(imported.id);
  const [importedTag] = await api.listElectionTags(imported.id);
  const [importedSummary] = await api.listSimulations(imported.id);
  const importedScenario = await api.getSimulation(imported.id, importedSummary.id);

  assert.equal(importedHypothesis.name, "Haute");
  assert.notEqual(importedHypothesis.id, hypothesis.id);
  assert.deepEqual(importedHypothesis.tag_ids, [importedTag.id]);
  assert.equal(importedTransfer.finalist_a, "Alice");
  assert.equal(importedScenario.r1_hypothesis_id, importedHypothesis.id);
  assert.equal(importedScenario.r2_hypothesis_id, importedTransfer.id);
  assert.deepEqual(
    importedScenario.candidates.map((candidate) => candidate.hypothesis_candidate_id),
    importedHypothesis.candidates.map((candidate) => candidate.id)
  );
  assert.deepEqual(
    (await api.listElectionCandidates(imported.id)).map((candidate) => [candidate.name, candidate.party]),
    [["Alice", "Parti A"], ["Benoît", "Parti B"]]
  );

  // La copie ne doit plus bouger quand l'originale évolue.
  const sourceHypothesis = await api.getElectionHypothesis(source.id, hypothesis.id);
  await api.updateHypothesisCandidate(source.id, hypothesis.id, sourceHypothesis.candidates[0].id, { pct_r1: 99 });
  const stillTheSame = await api.getElectionHypothesis(imported.id, importedHypothesis.id);
  assert.equal(stillTheSame.candidates[0].pct_r1, 40);
});