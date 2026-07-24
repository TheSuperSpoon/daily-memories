import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteAt, indexMonth, LatestRequest, moodDraftValue, monthKey, monthRange } from "../js/glimmer-model.js";

test("natural month ranges include leap days and stable cache keys", () => {
  const february = new Date(2028, 1, 12);
  assert.equal(monthKey(february), "2028-02");
  assert.deepEqual(monthRange(february), { from: "2028-02-01", to: "2028-02-29" });
});

test("month records are indexed by date and backend role", () => {
  const ray = { id: "r", role: "ray", glimmer_date: "2026-07-20" };
  const mel = { id: "m", role: "mel", glimmer_date: "2026-07-20" };
  const indexed = indexMonth([ray, mel]);
  assert.equal(indexed.days["2026-07-20"].ray, ray);
  assert.equal(indexed.days["2026-07-20"].mel, mel);
});

test("an explicit null mood draft overrides a saved mood", () => {
  const drafts = new Map();
  assert.equal(moodDraftValue(drafts, "2026-07-20:ray", "happy"), "happy");
  drafts.set("2026-07-20:ray", null);
  assert.equal(moodDraftValue(drafts, "2026-07-20:ray", "happy"), null);
});

test("stale requests cannot be treated as current", () => {
  const requests = new LatestRequest();
  const first = requests.next();
  const second = requests.next();
  assert.equal(requests.isCurrent(first), false);
  assert.equal(requests.isCurrent(second), true);
  requests.invalidate();
  assert.equal(requests.isCurrent(second), false);
});

test("delete visibility follows the role across account replacement and an open server-time window", () => {
  const serverNow = Date.parse("2026-07-21T00:00:00Z");
  const dashboard = { user_id: "new-account", role: "mel" };
  assert.equal(canDeleteAt({ owner_id: "deleted-account", role: "mel", created_at: "2026-07-20T00:00:01Z" }, dashboard, serverNow), true);
  assert.equal(canDeleteAt({ owner_id: "new-account", role: "ray", created_at: "2026-07-20T23:00:00Z" }, dashboard, serverNow), false);
  assert.equal(canDeleteAt({ owner_id: "deleted-account", role: "mel", created_at: "2026-07-20T00:00:00Z" }, dashboard, serverNow), false);
});
