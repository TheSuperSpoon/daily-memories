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

export function canOpenStats(identity) {
  return canAccessMelFeature(identity);
}

export function shouldShowPrelude(identity, completed) {
  return canAccessMelFeature(identity) && completed !== true;
}

export function canReturnToPrelude(identity, completed) {
  return canAccessMelFeature(identity) && completed === true;
}

export function accessiblePage(requestedPage, identity, foundAllGifts) {
  if (requestedPage === "gift-secret" && !canAccessGiftPage(identity, foundAllGifts)) return "home";
  return requestedPage;
}
