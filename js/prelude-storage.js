export const MEL_PRELUDE_RESET_KEY = 'mel-prelude-reset:20260721-launch';

export function melPreludeStorageKey(spaceId, role) {
  return `melPreludeComplete:${spaceId}:${role}`;
}

export function migrateMelPreludeCompletion(storage, { spaceId, role, userId }) {
  if (!storage || role !== 'mel' || !spaceId) return false;
  const roleKey = melPreludeStorageKey(spaceId, role);
  if (storage.getItem(roleKey) === 'yes') return false;
  const legacyKey = userId ? `melPreludeComplete:${userId}` : null;
  if (!legacyKey || storage.getItem(legacyKey) !== 'yes') return false;
  storage.setItem(roleKey, 'yes');
  storage.removeItem(legacyKey);
  return true;
}

export function clearLegacyMelPreludeState(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(MEL_PRELUDE_RESET_KEY) === 'yes') return false;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key === 'melPreludeComplete' || key?.startsWith('melPreludeComplete:')) storage.removeItem(key);
  }
  storage.setItem(MEL_PRELUDE_RESET_KEY, 'yes');
  return true;
}
