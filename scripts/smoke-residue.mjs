import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
const execute = process.argv.includes('--clean');
assert.ok(url && secret, 'SUPABASE_URL and SUPABASE_SECRET_KEY are required');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function query(table, columns, configure) {
  const { data, error } = await configure(admin.from(table).select(columns));
  if (error) throw error;
  return data;
}

const glimmers = await query('glimmers', 'id,note,glimmer_assets(bucket,object_key)', (request) =>
  request.eq('space_id', spaceId).or('note.like.launch-%,note.like.QA glimmer timezone %,note.like.random smoke %'));
const memories = await query('memories', 'id,body,memory_assets(bucket,object_key)', (request) =>
  request.eq('space_id', spaceId).or('body.like.online image %,body.like.online audio %'));
const likes = await query('mel_likes', 'id,label,mel_like_assets(bucket,object_key)', (request) =>
  request.eq('space_id', spaceId).like('label', 'Smoke favorite %'));

const assets = [
  ...glimmers.flatMap(({ glimmer_assets = [] }) => glimmer_assets),
  ...memories.flatMap(({ memory_assets = [] }) => memory_assets),
  ...likes.flatMap(({ mel_like_assets = [] }) => mel_like_assets),
].filter(({ bucket, object_key }) => bucket && object_key);

if (execute) {
  assert.equal(process.env.CONFIRM_SMOKE_CLEANUP, 'DELETE_ONLY_PREFIXED_SMOKE_RECORDS');
  for (const bucket of new Set(assets.map(({ bucket: value }) => value))) {
    const keys = [...new Set(assets.filter((asset) => asset.bucket === bucket).map((asset) => asset.object_key))];
    if (keys.length) {
      const { error } = await admin.storage.from(bucket).remove(keys);
      if (error) throw error;
    }
  }
  for (const [table, records] of [['glimmers', glimmers], ['memories', memories], ['mel_likes', likes]]) {
    const ids = records.map(({ id }) => id);
    if (ids.length) {
      const { error } = await admin.from(table).delete().in('id', ids);
      if (error) throw error;
    }
  }
}

console.log(JSON.stringify({ passed: true, mode: execute ? 'clean' : 'audit',
  records: { glimmers: glimmers.length, memories: memories.length, melLikes: likes.length }, assets: assets.length }));
