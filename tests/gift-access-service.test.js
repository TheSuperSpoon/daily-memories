import assert from "node:assert/strict";
import test from "node:test";
import { collectGiftForIdentity, loadGiftStateForIdentity } from "../js/gift-access-service.js";

function repositorySpy() {
  const calls = [];
  return {
    calls,
    async getGiftState(spaceId) {
      calls.push(["get", spaceId]);
      return { home: true };
    },
    async collectGiftIcon(spaceId, giftId) {
      calls.push(["collect", spaceId, giftId]);
      return { [giftId]: true };
    },
  };
}

test("Mel can load and collect gifts through the repository", async () => {
  const repository = repositorySpy();
  assert.deepEqual(await loadGiftStateForIdentity({ identity: { role: "mel" }, spaceId: "space", repository }), { home: true });
  assert.deepEqual(await collectGiftForIdentity({ identity: { role: "mel" }, spaceId: "space", giftId: "home", repository }), { home: true });
  assert.deepEqual(repository.calls, [["get", "space"], ["collect", "space", "home"]]);
});

test("Ray and missing identities never call the gift repository", async () => {
  const repository = repositorySpy();
  assert.equal(await loadGiftStateForIdentity({ identity: { role: "ray" }, spaceId: "space", repository }), null);
  assert.equal(await collectGiftForIdentity({ identity: null, spaceId: "space", giftId: "home", repository }), null);
  assert.deepEqual(repository.calls, []);
});
