import assert from 'node:assert/strict';
import test from 'node:test';
import { GlimmerRepository } from '../js/glimmer-repository.js';

function harness(responses = {}) {
  const calls = []; const storageCalls = [];
  const supabase = {
    rpc: async (name, args) => { calls.push([name, args]); return responses[name] ?? { data: null, error: null }; },
    auth: {}
  };
  const adapter = { upload: async (...args) => storageCalls.push(['upload', ...args]),
    remove: async (...args) => storageCalls.push(['remove', ...args]) };
  return { repository: new GlimmerRepository({ supabase, storageFactory: { forAsset: () => adapter } }), calls, storageCalls };
}

test('upload follows begin, adapter, finalize contract', async () => {
  const asset = { provider: 'supabase', bucket: 'glimmers', object_key: 'x' };
  const h = harness({ begin_glimmer_upload: { data: { id: 'g1', asset }, error: null },
    finalize_glimmer_upload: { data: { id: 'g1', status: 'ready' }, error: null } });
  const result = await h.repository.uploadGlimmer({ spaceId: 's', date: '2026-07-12', note: '<script>',
    file: { type: 'image/jpeg', size: 10 } });
  assert.equal(result.status, 'ready');
  assert.deepEqual(h.calls.map(([name]) => name), ['begin_glimmer_upload', 'finalize_glimmer_upload']);
  assert.equal(h.storageCalls[0][0], 'upload');
});

test('invalid MIME and oversized files fail before RPC', async () => {
  const h = harness();
  await assert.rejects(h.repository.uploadGlimmer({ file: { type: 'text/html', size: 1 } }),
    (error) => error.code === 'INVALID_CONTENT_TYPE');
  await assert.rejects(h.repository.uploadGlimmer({ file: { type: 'image/png', size: 10485761 } }),
    (error) => error.code === 'INVALID_FILE_SIZE');
  assert.equal(h.calls.length, 0);
});

test('finalize failure is exposed as retryable without leaking SDK shape', async () => {
  const h = harness({ begin_glimmer_upload: { data: { id: 'g1', asset: { provider: 'supabase' } }, error: null },
    finalize_glimmer_upload: { data: null, error: { message: 'temporary' } } });
  await assert.rejects(h.repository.uploadGlimmer({ file: { type: 'image/png', size: 2 } }),
    (error) => error.retryable && error.glimmerId === 'g1' && error.code === 'BACKEND_ERROR');
});
