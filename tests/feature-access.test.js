import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessGiftPage,
  canAccessMelFeature,
  canOpenStats,
  canReturnToPrelude,
  accessiblePage,
  hasRole,
  shouldShowPrelude,
} from "../js/feature-access.js";

test("Mel-only features require the backend member role", () => {
  assert.equal(canAccessMelFeature({ role: "mel" }), true);
  assert.equal(canAccessMelFeature({ role: "ray" }), false);
  assert.equal(canAccessMelFeature(null), false);
  assert.equal(hasRole({ role: "mel" }, "ray"), false);
});

test("stats and birthday prelude use the same backend role boundary", () => {
  assert.equal(canOpenStats({ role: "mel" }), true);
  assert.equal(canOpenStats({ role: "ray" }), false);
  assert.equal(shouldShowPrelude({ role: "mel" }, false), true);
  assert.equal(shouldShowPrelude({ role: "mel" }, true), false);
  assert.equal(shouldShowPrelude({ role: "ray" }, false), false);
  assert.equal(canReturnToPrelude({ role: "mel" }, true), true);
  assert.equal(canReturnToPrelude({ role: "ray" }, true), false);
});

test("the secret gift page requires both Mel role and completion", () => {
  assert.equal(canAccessGiftPage({ role: "mel" }, true), true);
  assert.equal(canAccessGiftPage({ role: "mel" }, false), false);
  assert.equal(canAccessGiftPage({ role: "ray" }, true), false);
  assert.equal(canAccessGiftPage(null, true), false);
  assert.equal(accessiblePage("gift-secret", { role: "mel" }, true), "gift-secret");
  assert.equal(accessiblePage("gift-secret", { role: "ray" }, true), "home");
  assert.equal(accessiblePage("gift-secret", null, false), "home");
  assert.equal(accessiblePage("gallery", null, false), "gallery");
});
