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

test('upload failure cancels pending metadata', async () => {
  const calls = [];
  const repository = new GlimmerRepository({
    supabase: { auth: {}, rpc: async (name) => {
      calls.push(name);
      if (name === 'begin_glimmer_upload') return { data: { id: 'g1', asset: { provider: 'supabase' } }, error: null };
      return { data: { cancelled: true }, error: null };
    } },
    storageFactory: { forAsset: () => ({ upload: async () => { throw Object.assign(new Error('no network'), { code: 'UPLOAD_REJECTED' }); } }) }
  });
  await assert.rejects(repository.uploadGlimmer({ file: { type: 'image/webp', size: 3 } }),
    (error) => error.code === 'UPLOAD_REJECTED');
  assert.deepEqual(calls, ['begin_glimmer_upload', 'cancel_glimmer_upload']);
});

test('session expiry and network failures use stable codes without SDK leakage', async () => {
  const expired = harness({ begin_glimmer_upload: { data: null, error: { message: 'JWT expired', sdk: 'private' } } });
  await assert.rejects(expired.repository.uploadGlimmer({ file: { type: 'image/png', size: 2 } }),
    (error) => error.code === 'SESSION_EXPIRED' && error.cause === undefined && !('sdk' in error));
  const offline = harness({ begin_glimmer_upload: { data: null, error: { message: 'Failed to fetch', sdk: 'private' } } });
  await assert.rejects(offline.repository.uploadGlimmer({ file: { type: 'image/png', size: 2 } }),
    (error) => error.code === 'NETWORK_ERROR' && error.cause === undefined && !('sdk' in error));
});

test('password recovery updates the authenticated recovery user', async () => {
  const calls = [];
  const repository = new GlimmerRepository({
    supabase: { auth: { updateUser: async (attributes) => {
      calls.push(attributes); return { data: { user: { id: 'u1' } }, error: null };
    } } },
    storageFactory: {}
  });
  const result = await repository.updatePassword('new secure password');
  assert.equal(result.user.id, 'u1');
  assert.deepEqual(calls, [{ password: 'new secure password' }]);
});
