import assert from "node:assert/strict";
import { test } from "node:test";
import { floatingListPosition } from "./floatingListPosition.js";

test("suggestions stay inside a narrow viewport near its right edge", () => {
  const position = floatingListPosition(
    { left: 240, top: 100, bottom: 144, width: 160 },
    { width: 320, height: 568 }
  );
  assert.equal(position.left, 92);
  assert.equal(position.width, 220);
  assert.equal(position.top, 146);
  assert.equal(position.bottom, "auto");
  assert.equal(position.maxHeight, 240);
});

test("suggestions open above the field when the mobile keyboard reduces available space", () => {
  const position = floatingListPosition(
    { left: 20, top: 240, bottom: 284, width: 280 },
    { width: 320, height: 320, layoutHeight: 844 }
  );
  assert.equal(position.top, "auto");
  assert.equal(position.bottom, 606);
  assert.equal(position.maxHeight, 232);
});

test("suggestions follow a shifted visual viewport and never exceed its width", () => {
  const position = floatingListPosition(
    { left: 0, top: 180, bottom: 224, width: 400 },
    { left: 30, top: 100, width: 200, height: 300, layoutHeight: 844 }
  );
  assert.equal(position.left, 38);
  assert.equal(position.width, 184);
  assert.equal(position.maxHeight, 168);
  assert.equal(position.top, 226);
});
