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

test("Custom round tags persist independently and follow duplication and hypothesis creation", async () => {
  resetStorage();

  const election = await api.createElection("Tags");
  const otherElection = await api.createElection("Other");
  const first = await api.createElectionTag(election.id, { name: "First" });
  const second = await api.createElectionTag(election.id, { name: "Second" });
  const foreign = await api.createElectionTag(otherElection.id, { name: "Foreign" });

  const simulation = await api.createSimulation(election.id, "Custom");
  assert.deepEqual(simulation.r1_tag_ids, []);
  assert.deepEqual(simulation.r2_tag_ids, []);

  // Chaque tour conserve ses tags; les doublons et les tags étrangers sont ignorés.
  await api.updateSimulation(simulation.id, {
    r1_tag_ids: [first.id, first.id, foreign.id, 9999],
    r2_tag_ids: [second.id],
  });

  const loaded = await api.getSimulation(election.id, simulation.id);
  assert.deepEqual(loaded.r1_tag_ids, [first.id]);
  assert.deepEqual(loaded.r2_tag_ids, [second.id]);

  // Modifier une copie ne doit pas modifier les tags du scénario original.
  const copy = await api.duplicateSimulation(simulation.id);
  await api.updateSimulation(copy.id, { r1_tag_ids: [] });

  assert.deepEqual((await api.getSimulation(simulation.id)).r1_tag_ids, [first.id]);
  assert.deepEqual(copy.r2_tag_ids, [second.id]);

  // L'import remappe les tags vers les identifiants de la nouvelle élection.
  const exported = await api.exportElection(election.id);
  const imported = await api.importElection(exported);
  const [importedSummary] = await api.listSimulations(imported.id);
  const importedSimulation = await api.getSimulation(imported.id, importedSummary.id);
  const importedTags = await api.listElectionTags(imported.id);

  assert.deepEqual(importedSimulation.r1_tag_ids, [importedTags.find((tag) => tag.name === "First").id]);
  assert.deepEqual(importedSimulation.r2_tag_ids, [importedTags.find((tag) => tag.name === "Second").id]);

  // Supprimer un tag importé nettoie les références sans toucher à l'original.
  await api.deleteElectionTag(imported.id, importedSimulation.r1_tag_ids[0]);

  assert.deepEqual((await api.getSimulation(imported.id, importedSummary.id)).r1_tag_ids, []);
  assert.deepEqual((await api.getSimulation(simulation.id)).r1_tag_ids, [first.id]);

  // Les hypothèses créées héritent des tags Custom de leur tour respectif.
  await api.addCandidate(simulation.id, { name: "Alice", pct_r1: 60 });
  await api.addCandidate(simulation.id, { name: "Bob", pct_r1: 40 });
  const { hypothesis: firstHypothesis } = await api.saveSimulationAsFirstRoundHypothesis(election.id, simulation.id);
  const { hypothesis: secondHypothesis } = await api.saveSimulationAsTransferHypothesis(election.id, simulation.id);

  assert.deepEqual(firstHypothesis.tag_ids, [first.id]);
  assert.deepEqual(secondHypothesis.tag_ids, [second.id]);

  // Une section liée ne permet plus de modifier ses tags depuis le scénario.
  for (const round of ["r1", "r2"]) {
    await assert.rejects(api.updateSimulation(simulation.id, { [`${round}_tag_ids`]: [] }), /tags/);
  }

  // Le retour en Custom récupère les tags actuels, même modifiés depuis la liaison.
  await api.updateElectionHypothesis(election.id, firstHypothesis.id, { tag_ids: [second.id] });
  await api.updateElectionTransferHypothesis(election.id, secondHypothesis.id, { tag_ids: [first.id] });
  const detachedFirst = await api.setSimulationFirstRoundHypothesis(election.id, simulation.id, null);
  const detachedSecond = await api.setSimulationTransferHypothesis(election.id, simulation.id, null);

  assert.deepEqual(detachedFirst.r1_tag_ids, [second.id]);
  assert.deepEqual(detachedSecond.r2_tag_ids, [first.id]);

  await api.updateSimulation(simulation.id, { r1_tag_ids: [], r2_tag_ids: [] });
  assert.deepEqual((await api.getSimulation(simulation.id)).r2_tag_ids, []);
});

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
  assert.deepEqual(simulation.r1_tag_ids, []);
  assert.deepEqual(simulation.r2_tag_ids, []);
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
});

test("les candidats reçoivent une couleur par défaut, modifiable et reprise par le Sankey", async () => {
  resetStorage();
  const election = await api.createElection("Couleurs");
  const simulation = await api.createSimulation(election.id, "Duel");
  await api.addCandidate(simulation.id, { name: "Alice", pct_r1: 60 });
  await api.addCandidate(simulation.id, { name: "Bob", pct_r1: 40 });

  const [alice, bob] = await api.listElectionCandidates(election.id);
  assert.match(alice.color, /^#[0-9a-f]{6}$/);
  assert.match(bob.color, /^#[0-9a-f]{6}$/);
  assert.notEqual(alice.color, bob.color);

  await api.setElectionCandidateColor(election.id, "Alice", "#ABCDEF");
  await api.updateElectionCandidate(election.id, bob.id, { color: "#123456" });
  await assert.rejects(api.updateElectionCandidate(election.id, bob.id, { color: "rouge" }), /Couleur/);

  const loaded = await api.getSimulation(election.id, simulation.id);
  const nodeColor = (id) => [...loaded.sankey.nodesLeft, ...loaded.sankey.nodesRight].find((node) => node.id === id).color;
  const [aliceRow, bobRow] = loaded.candidates;
  assert.equal(nodeColor(`c${aliceRow.id}`), "#abcdef");
  assert.equal(nodeColor(`c${bobRow.id}`), "#123456");
  assert.equal(nodeColor("fa"), "#abcdef");
  assert.equal(nodeColor("fb"), "#123456");

  const imported = await api.importElection(await api.exportElection(election.id));
  assert.deepEqual(
    (await api.listElectionCandidates(imported.id)).map((candidate) => [candidate.name, candidate.color]),
    [["Alice", "#abcdef"], ["Bob", "#123456"]]
  );
});

test("la couleur des abstentionnistes est configurable et reprise par le Sankey", async () => {
  resetStorage();
  const election = await api.createElection("Abstention");
  assert.equal((await api.getElection(election.id)).abstention_color, "#999999");
  const simulation = await api.createSimulation(election.id, "Duel");
  await api.addCandidate(simulation.id, { name: "Alice", pct_r1: 60 });
  await api.addCandidate(simulation.id, { name: "Bob", pct_r1: 40 });

  await api.setElectionAbstentionColor(election.id, "#ABC123");
  await assert.rejects(api.setElectionAbstentionColor(election.id, "gris"), /Couleur/);
  assert.equal((await api.getElection(election.id)).abstention_color, "#abc123");

  const loaded = await api.getSimulation(election.id, simulation.id);
  const nodeColor = (id) => [...loaded.sankey.nodesLeft, ...loaded.sankey.nodesRight].find((node) => node.id === id).color;
  assert.equal(nodeColor("abst1"), "#abc123");
  assert.equal(nodeColor("abst2"), "#abc123");

  const imported = await api.importElection(await api.exportElection(election.id));
  assert.equal((await api.getElection(imported.id)).abstention_color, "#abc123");
});

test("le référentiel retire un candidat supprimé ou remplacé seulement sans autre usage", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const first = await api.createSimulation(election.id, "Scénario A");
  const second = await api.createSimulation(election.id, "Scénario B");
  const { new_candidate_id: firstAliceId } = await api.addCandidate(first.id, { name: "Alice", pct_r1: 50 });
  const { new_candidate_id: secondAliceId } = await api.addCandidate(second.id, { name: "Alice", pct_r1: 60 });
  await api.createElectionCandidate(election.id, { name: "Benoît" });

  await api.deleteCandidate(first.id, firstAliceId);
  assert.equal((await api.listElectionCandidates(election.id)).find((candidate) => candidate.name === "Alice").usage_count, 1);

  await api.updateCandidate(second.id, secondAliceId, { name: "Benoît" });
  const references = await api.listElectionCandidates(election.id);
  assert.equal(references.some((candidate) => candidate.name === "Alice"), false);
  assert.equal(references.find((candidate) => candidate.name === "Benoît").usage_count, 1);

  const { new_candidate_id: chloeId } = await api.addCandidate(first.id, { name: "Chloé", pct_r1: 10 });
  await api.deleteCandidate(first.id, chloeId);
  assert.equal((await api.listElectionCandidates(election.id)).some((candidate) => candidate.name === "Chloé"), false);
});

test("le remplacement d'une ligne conserve le candidat si une hypothèse l'utilise encore", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const simulation = await api.createSimulation(election.id, "Scénario");
  const { new_candidate_id: aliceId } = await api.addCandidate(simulation.id, { name: "Alice", pct_r1: 50 });
  const hypothesis = await api.createElectionHypothesis(election.id);
  await api.addHypothesisCandidate(election.id, hypothesis.id, { name: "Alice", pct_r1: 55 });

  await api.updateCandidate(simulation.id, aliceId, { name: "Benoît" });

  const references = await api.listElectionCandidates(election.id);
  assert.equal(references.find((candidate) => candidate.name === "Alice").usage_count, 1);
  assert.equal(references.find((candidate) => candidate.name === "Benoît").usage_count, 1);
});

test("les candidats d'hypothèse sont nettoyés après suppression ou remplacement si aucun usage ne reste", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const hypothesis = await api.createElectionHypothesis(election.id);
  const otherHypothesis = await api.createElectionHypothesis(election.id);
  const first = await api.addHypothesisCandidate(election.id, hypothesis.id, { name: "Alice", pct_r1: 50 });
  await api.addHypothesisCandidate(election.id, otherHypothesis.id, { name: "Alice", pct_r1: 55 });
  const candidateToReplace = first.candidates[0];
  const candidateToDelete = await api.addHypothesisCandidate(election.id, hypothesis.id, { name: "Chloé", pct_r1: 10 });

  await api.deleteHypothesisCandidate(election.id, hypothesis.id, candidateToDelete.candidates[1].id);
  assert.equal((await api.listElectionCandidates(election.id)).find((candidate) => candidate.name === "Chloé"), undefined);
  assert.equal((await api.listElectionCandidates(election.id)).find((candidate) => candidate.name === "Alice").usage_count, 2);

  await api.updateHypothesisCandidate(election.id, hypothesis.id, candidateToReplace.id, { name: "Benoît" });
  const references = await api.listElectionCandidates(election.id);
  assert.equal(references.some((candidate) => candidate.name === "Alice"), true);
  assert.equal(references.find((candidate) => candidate.name === "Alice").usage_count, 1);
  assert.equal(references.find((candidate) => candidate.name === "Benoît").usage_count, 1);

  await api.deleteHypothesisCandidate(election.id, otherHypothesis.id, (await api.getElectionHypothesis(election.id, otherHypothesis.id)).candidates[0].id);
  assert.equal((await api.listElectionCandidates(election.id)).some((candidate) => candidate.name === "Alice"), false);
});

test("un candidat ne peut pas être ajouté deux fois au même scénario ou à la même hypothèse", async () => {
  resetStorage();
  const election = await api.createElection("Municipales");
  const simulation = await api.createSimulation(election.id, "Scénario");
  await api.addCandidate(simulation.id, { name: "Élodie", pct_r1: 50 });

  await assert.rejects(
    api.addCandidate(simulation.id, { name: "elodie", pct_r1: 10 }),
    /existe déjà dans le tableau/
  );
  assert.equal((await api.getSimulation(simulation.id)).candidates.length, 1);

  const hypothesis = await api.createElectionHypothesis(election.id);
  await api.addHypothesisCandidate(election.id, hypothesis.id, { name: "Alice", pct_r1: 50 });
  await assert.rejects(
    api.addHypothesisCandidate(election.id, hypothesis.id, { name: "alice", pct_r1: 10 }),
    /existe déjà dans cette hypothèse/
  );
  assert.equal((await api.getElectionHypothesis(election.id, hypothesis.id)).candidates.length, 1);

  const linked = await api.createSimulation(election.id, "Scénario lié");
  await api.setSimulationFirstRoundHypothesis(election.id, linked.id, hypothesis.id);
  await api.addCandidate(linked.id, { name: "Benoît", pct_r1: 10 });
  await assert.rejects(
    api.addHypothesisCandidate(election.id, hypothesis.id, { name: "Benoît", pct_r1: 10 }),
    /existe déjà dans un scénario lié/
  );
  assert.equal((await api.getElectionHypothesis(election.id, hypothesis.id)).candidates.length, 1);
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