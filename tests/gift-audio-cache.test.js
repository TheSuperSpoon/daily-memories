import assert from 'node:assert/strict';
import test from 'node:test';
import { clearGiftAudioCache, giftAudioCacheKey, resolveGiftAudioSource } from '../js/gift-audio-cache.js';

function audio(url = 'https://signed.invalid/audio') {
  return {
    id: 'in-loving-memory', sha256: 'a'.repeat(64), url,
    asset: { size_bytes: 4, content_type: 'audio/mpeg' },
  };
}

function cacheHarness(initial = null) {
  const records = new Map(initial ? [[giftAudioCacheKey(audio(), 'http://local.test'), initial]] : []);
  return {
    records,
    storage: { async open() { return {
      async match(key) { return records.get(key) ?? null; },
      async put(key, value) { records.set(key, value); },
      async delete(key) { return records.delete(key); },
    }; } },
  };
}

test('gift audio uses a valid same-device cache before the signed URL', async () => {
  const cached = new Response(new Blob(['gift'], { type: 'audio/mpeg' }));
  const harness = cacheHarness(cached);
  let fetched = false;
  const result = await resolveGiftAudioSource(audio(), {
    cacheStorage: harness.storage, origin: 'http://local.test',
    fetchImpl: async () => { fetched = true; return null; },
    createObjectURL: () => 'blob:cached',
  });
  assert.equal(result.source, 'cache');
  assert.equal(result.url, 'blob:cached');
  assert.equal(fetched, false);
});

test('gift audio downloads from Supabase and writes a stable local cache', async () => {
  const harness = cacheHarness();
  const result = await resolveGiftAudioSource(audio(), {
    cacheStorage: harness.storage, origin: 'http://local.test',
    fetchImpl: async () => new Response(new Blob(['gift'], { type: 'audio/mpeg' })),
    createObjectURL: () => 'blob:fresh',
  });
  assert.equal(result.source, 'supabase-cached');
  assert.equal(harness.records.size, 1);
});

test('resetting gift progress can remove the same-device audio cache', async () => {
  let deleted = null;
  assert.equal(await clearGiftAudioCache({ async delete(name) { deleted = name; return true; } }), true);
  assert.equal(deleted, 'daily-memories-gift-audio-v1');
});
