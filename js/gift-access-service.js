import { canAccessMelFeature } from "./feature-access.js";

export async function loadGiftStateForIdentity({ identity, spaceId, repository }) {
  if (!canAccessMelFeature(identity)) return null;
  return repository.getGiftState(spaceId);
}

export async function collectGiftForIdentity({ identity, spaceId, giftId, repository }) {
  if (!canAccessMelFeature(identity)) return null;
  return repository.collectGiftIcon(spaceId, giftId);
}
