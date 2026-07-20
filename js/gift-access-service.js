import { canAccessMelFeature } from "./feature-access.js";

export async function loadGiftStateForIdentity({ identity, spaceId, repository }) {
  if (!canAccessMelFeature(identity)) return null;
  return repository.getGiftState(spaceId);
}

export async function collectGiftForIdentity({ identity, spaceId, giftId, repository }) {
  if (!canAccessMelFeature(identity)) return null;
  return repository.collectGiftIcon(spaceId, giftId);
}

export async function loadGiftAudioForIdentity({ identity, foundAnyGift, spaceId, repository }) {
  if (!canAccessMelFeature(identity) || !foundAnyGift) return null;
  return repository.getGiftAudio(spaceId);
}
