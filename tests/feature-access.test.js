import assert from "node:assert/strict";
import test from "node:test";
import { canAccessGiftPage, canAccessMelFeature, hasRole } from "../js/feature-access.js";

test("Mel-only features require the backend member role", () => {
  assert.equal(canAccessMelFeature({ role: "mel" }), true);
  assert.equal(canAccessMelFeature({ role: "ray" }), false);
  assert.equal(canAccessMelFeature(null), false);
  assert.equal(hasRole({ role: "mel" }, "ray"), false);
});

test("the secret gift page requires both Mel role and completion", () => {
  assert.equal(canAccessGiftPage({ role: "mel" }, true), true);
  assert.equal(canAccessGiftPage({ role: "mel" }, false), false);
  assert.equal(canAccessGiftPage({ role: "ray" }, true), false);
  assert.equal(canAccessGiftPage(null, true), false);
});
