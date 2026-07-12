import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageAdapterFactory } from '../js/storage/storage-adapter-factory.js';
import { SupabaseStorageAdapter } from '../js/storage/supabase-storage-adapter.js';

const asset = { provider: 'supabase', bucket: 'glimmers', object_key: 'spaces/s/users/u/2026/07/g.jpg' };

function clientWith(result, calls) {
  return { storage: { from(bucket) { return {
    async upload(key, file, options) { calls.push(['upload', bucket, key, file, options]); return result.upload ?? {}; },
    list(folder, options) { calls.push(['list', folder, options]); return Promise.resolve(result.list ?? { data: [] }); },
    createSignedUrl(key, ttl) { calls.push(['signed', key, ttl]); return Promise.resolve(result.signed ?? {}); },
    async remove(keys) { calls.push(['remove', keys]); return result.remove ?? {}; }
  }; } } };
}

test('factory rejects unknown providers explicitly', () => {
  assert.throws(() => new StorageAdapterFactory({}).forAsset({ provider: 'r2' }),
    (error) => error.code === 'UNSUPPORTED_STORAGE_PROVIDER');
});

test('adapter uploads without upsert and preserves content type', async () => {
  const calls = []; const adapter = new SupabaseStorageAdapter(clientWith({}, calls));
  await adapter.upload(asset, { type: 'image/jpeg' });
  assert.deepEqual(calls[0][4], { contentType: 'image/jpeg', upsert: false });
});

test('adapter maps provider errors to stable codes', async () => {
  const adapter = new SupabaseStorageAdapter(clientWith({ upload: { error: new Error('sdk detail') } }, []));
  await assert.rejects(adapter.upload(asset, { type: 'image/jpeg' }), (error) => error.code === 'UPLOAD_REJECTED');
});

test('adapter returns signed URL and removes exact object', async () => {
  const calls = []; const adapter = new SupabaseStorageAdapter(clientWith({
    signed: { data: { signedUrl: 'https://signed.invalid/x' } }, remove: {}
  }, calls));
  const readable = await adapter.getReadableUrl(asset, { expiresIn: 30 });
  assert.equal(readable.url, 'https://signed.invalid/x');
  await adapter.remove(asset);
  assert.deepEqual(calls.at(-1), ['remove', [asset.object_key]]);
});
