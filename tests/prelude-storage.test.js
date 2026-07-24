import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearLegacyMelPreludeState,
  melPreludeStorageKey,
  MEL_PRELUDE_RESET_KEY,
  migrateMelPreludeCompletion,
} from '../js/prelude-storage.js';

function storage(initial) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test('launch reset removes old Mel prelude completion without touching timezone preference', () => {
  const state = storage({
    'melPreludeComplete:deleted-user': 'yes',
    melPreludeComplete: 'yes',
    'memory-preferred-timezone': 'Asia/Shanghai',
  });
  assert.equal(clearLegacyMelPreludeState(state), true);
  assert.equal(state.getItem('melPreludeComplete:deleted-user'), null);
  assert.equal(state.getItem('melPreludeComplete'), null);
  assert.equal(state.getItem('memory-preferred-timezone'), 'Asia/Shanghai');
  assert.equal(state.getItem(MEL_PRELUDE_RESET_KEY), 'yes');
  assert.equal(clearLegacyMelPreludeState(state), false);
});

test('Mel prelude completion migrates from account id to the stable space role', () => {
  const state = storage({ 'melPreludeComplete:deleted-user': 'yes' });
  assert.equal(migrateMelPreludeCompletion(state, {
    spaceId: 'space-1', role: 'mel', userId: 'deleted-user'
  }), true);
  assert.equal(state.getItem(melPreludeStorageKey('space-1', 'mel')), 'yes');
  assert.equal(state.getItem('melPreludeComplete:deleted-user'), null);
  assert.equal(migrateMelPreludeCompletion(state, {
    spaceId: 'space-1', role: 'mel', userId: 'new-user'
  }), false);
});
