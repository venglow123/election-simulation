import assert from "node:assert/strict";
import { test } from "node:test";
import { filterHypothesesByTags, getRefinementTags, getTagTextColor, pickTagColor, TAG_PALETTE } from "./tags.js";

const tags = [
  { id: 1, name: "Gauche" },
  { id: 2, name: "Droite" },
  { id: 3, name: "Sondage" },
  { id: 4, name: "Orphelin" },
];
const hypotheses = [
  { id: 10, tag_ids: [1, 3] },
  { id: 11, tag_ids: [2, 3] },
  { id: 12, tag_ids: [1] },
];

test("le filtre par tags combine les tags sélectionnés (ET) et propose les tags restants", () => {
  assert.deepEqual(filterHypothesesByTags(hypotheses, []).map((item) => item.id), [10, 11, 12]);
  assert.deepEqual(getRefinementTags(tags, hypotheses, []).map((tag) => tag.id), [1, 2, 3]);

  const bySurvey = filterHypothesesByTags(hypotheses, [3]);
  assert.deepEqual(bySurvey.map((item) => item.id), [10, 11]);
  assert.deepEqual(getRefinementTags(tags, bySurvey, [3]).map((tag) => tag.id), [1, 2]);

  const narrowed = filterHypothesesByTags(hypotheses, [3, 1]);
  assert.deepEqual(narrowed.map((item) => item.id), [10]);
  assert.deepEqual(getRefinementTags(tags, narrowed, [3, 1]), []);
});

test("les couleurs automatiques évitent celles déjà utilisées", () => {
  assert.equal(pickTagColor([]), TAG_PALETTE[0]);
  assert.equal(pickTagColor([TAG_PALETTE[0].toUpperCase()]), TAG_PALETTE[1]);
  assert.ok(TAG_PALETTE.includes(pickTagColor([...TAG_PALETTE])));
  assert.equal(getTagTextColor("#ffffff"), "#111827");
  assert.equal(getTagTextColor("#000000"), "#ffffff");
});
