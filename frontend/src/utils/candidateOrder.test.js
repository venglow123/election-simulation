import assert from "node:assert/strict";
import { test } from "node:test";
import { moveCandidateToSlot } from "./candidateOrder.js";

test("insertion slots move a row up or down without changing the source order", () => {
  const order = [11, 12, 13, 14];
  assert.deepEqual(moveCandidateToSlot(order, 0, 4), [12, 13, 14, 11]);
  assert.deepEqual(moveCandidateToSlot(order, 3, 0), [14, 11, 12, 13]);
  assert.deepEqual(moveCandidateToSlot(order, 1, 3), [11, 13, 12, 14]);
  assert.deepEqual(moveCandidateToSlot(order, 2, 1), [11, 13, 12, 14]);
  assert.deepEqual(order, [11, 12, 13, 14]);
});

test("dropping at either boundary of the source row is a no-op", () => {
  const order = [11, 12, 13];
  assert.deepEqual(moveCandidateToSlot(order, 1, 1), order);
  assert.deepEqual(moveCandidateToSlot(order, 1, 2), order);
  assert.deepEqual(moveCandidateToSlot([11], 0, 1), [11]);
});

test("invalid drag positions are rejected", () => {
  for (const [fromIndex, slot] of [[-1, 0], [3, 0], [1, -1], [1, 4], [0.5, 0], [0, null]]) {
    assert.throws(() => moveCandidateToSlot([11, 12, 13], fromIndex, slot), /position/);
  }
});
