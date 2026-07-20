import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryRepository } from '../js/memory-repository.js';

function harness(responses = {}, adapterOverrides = {}) {
  const calls = []; const storageCalls = [];
  const supabase = { rpc: async (name, args) => {
    calls.push([name, args]); return responses[name] ?? { data: null, error: null };
  } };
  const adapter = {
    upload: async (...args) => storageCalls.push(['upload', ...args]),
    remove: async (...args) => storageCalls.push(['remove', ...args]),
    getReadableUrl: async (...args) => { storageCalls.push(['url', ...args]); return { url: 'signed', expiresAt: 1 }; },
    ...adapterOverrides,
  };
  return { repository: new MemoryRepository({ supabase, storageFactory: { forAsset: () => adapter } }), calls, storageCalls };
}

test('memory upload sends normalized metadata before upload and finalize', async () => {
  const asset = { provider: 'supabase', bucket: 'memories', object_key: 'x' };
  const h = harness({
    begin_memory_upload: { data: { id: 'm1', asset }, error: null },
    finalize_memory_upload: { data: { id: 'm1', status: 'ready' }, error: null },
  });
  const result = await h.repository.uploadMemory({ spaceId: 's1', body: 'hello', tags: ['#Summer', 'summer'],
    preferredTimezone: 'America/Los_Angeles', file: { type: 'audio/mpeg', size: 10 } });
  assert.equal(result.status, 'ready');
  assert.deepEqual(h.calls.map(([name]) => name), ['begin_memory_upload', 'finalize_memory_upload']);
  assert.deepEqual(h.calls[0][1].p_tags, ['Summer']);
  assert.equal(h.calls[0][1].p_preferred_timezone, 'America/Los_Angeles');
  assert.equal(h.storageCalls[0][0], 'upload');
});

test('failed media upload cancels pending memory metadata', async () => {
  const h = harness({
    begin_memory_upload: { data: { id: 'm1', asset: { provider: 'supabase' } }, error: null },
    cancel_memory_upload: { data: { cancelled: true }, error: null },
  }, { upload: async () => { throw Object.assign(new Error('upload failed'), { code: 'UPLOAD_REJECTED' }); } });
  await assert.rejects(h.repository.uploadMemory({ spaceId: 's', preferredTimezone: 'Asia/Shanghai',
    file: { type: 'image/jpeg', size: 10 } }), (error) => error.code === 'UPLOAD_REJECTED');
  assert.deepEqual(h.calls.map(([name]) => name), ['begin_memory_upload', 'cancel_memory_upload']);
});

test('memory list, top tags, latest month, and delete use dedicated RPCs', async () => {
  const record = { id: 'm1', asset: { provider: 'supabase' } };
  const h = harness({
    list_memories: { data: [{ memory: record }], error: null },
    list_top_memory_tags: { data: [{ tag: { name: 'summer', count: 2 } }], error: null },
    get_latest_memory_month: { data: '2026-07', error: null },
    complete_memory_delete: { data: { deleted: true }, error: null },
  });
  assert.deepEqual(await h.repository.listMemories({ spaceId: 's', from: '2026-07-01', to: '2026-07-31' }), [record]);
  assert.equal((await h.repository.getTopTags('s'))[0].count, 2);
  assert.equal(await h.repository.getLatestMonth('s'), '2026-07');
  await h.repository.deleteMemory(record);
  assert.equal(h.storageCalls.at(-1)[0], 'remove');
  assert.equal(h.calls.at(-1)[0], 'complete_memory_delete');
});

test('Mel likes upload validates image and caption then follows begin/finalize', async () => {
  const asset = { provider: 'supabase' };
  const h = harness({
    begin_mel_like_upload: { data: { id: 'l1', asset }, error: null },
    finalize_mel_like_upload: { data: { id: 'l1', status: 'ready' }, error: null },
  });
  await h.repository.uploadMelLike({ spaceId: 's', label: ' Jinx ', file: { type: 'image/png', size: 10 } });
  assert.deepEqual(h.calls.map(([name]) => name), ['begin_mel_like_upload', 'finalize_mel_like_upload']);
  assert.equal(h.calls[0][1].p_label, 'Jinx');
  await assert.rejects(h.repository.uploadMelLike({ spaceId: 's', label: '', file: { type: 'image/png', size: 1 } }),
    (error) => error.code === 'INVALID_MEL_LIKE_LABEL');
});

