export const MEL_PRELUDE_RESET_KEY = 'mel-prelude-reset:20260721-launch';

export function clearLegacyMelPreludeState(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(MEL_PRELUDE_RESET_KEY) === 'yes') return false;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key === 'melPreludeComplete' || key?.startsWith('melPreludeComplete:')) storage.removeItem(key);
  }
  storage.setItem(MEL_PRELUDE_RESET_KEY, 'yes');
  return true;
}
