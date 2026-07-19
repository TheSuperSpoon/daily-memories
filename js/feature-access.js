export const MEL_ROLE = "mel";

export function hasRole(identity, role) {
  return Boolean(identity && identity.role === role);
}

export function canAccessMelFeature(identity) {
  return hasRole(identity, MEL_ROLE);
}

export function canAccessGiftPage(identity, foundAllGifts) {
  return canAccessMelFeature(identity) && foundAllGifts === true;
}
