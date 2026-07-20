import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { GlimmerRepository } from '../js/glimmer-repository.js';
import { StorageAdapterFactory } from '../js/storage/storage-adapter-factory.js';
import { SupabaseStorageAdapter } from '../js/storage/supabase-storage-adapter.js';

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
assert.ok(url && publishable && secret, 'Supabase launch smoke environment is required');

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = `launch-${Date.now()}-${randomBytes(3).toString('hex')}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  const result = Buffer.alloc(4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return result;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  return Buffer.concat([length, name, data, crc32(Buffer.concat([name, data]))]);
}
function pngFile(role) {
  const width = 12; const height = 12; const pixels = randomBytes(width * height * 3); const rows = [];
  for (let y = 0; y < height; y += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 3, (y + 1) * width * 3)]));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return new File([bytes], `${role}-${runId}.png`, { type: 'image/png' });
}
async function sessionForUser(userId) {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: userData.user.email });
  if (linkError) throw linkError;
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: verifyError } = await client.auth.verifyOtp({ token_hash: linkData.properties.hashed_token, type: 'email' });
  if (verifyError) throw verifyError;
  return client;
}

const { data: members, error: memberError } = await admin.from('space_members').select('user_id,role').eq('space_id', spaceId).order('role');
if (memberError) throw memberError;
assert.deepEqual(new Set(members.map(({ role }) => role)), new Set(['ray', 'mel']));
const contexts = [];
const created = [];
try {
  for (const member of members) {
    const client = await sessionForUser(member.user_id);
    const storageFactory = new StorageAdapterFactory({ supabase: new SupabaseStorageAdapter(client) });
    contexts.push({ ...member, client, repository: new GlimmerRepository({ supabase: client, storageFactory }) });
  }
  const rayContext = contexts.find(({ role }) => role === 'ray');
  const melContext = contexts.find(({ role }) => role === 'mel');
  const beijingDashboard = await rayContext.repository.getDashboard(spaceId, 'Asia/Shanghai');
  const westDashboard = await melContext.repository.getDashboard(spaceId, 'America/Los_Angeles');
  assert.equal(beijingDashboard.preferred_timezone, 'Asia/Shanghai');
  assert.equal(westDashboard.preferred_timezone, 'America/Los_Angeles');
  assert.equal(beijingDashboard.local_today, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  assert.equal(westDashboard.local_today, new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const { error: preLaunchDateError } = await contexts[0].client.rpc('begin_glimmer_upload', {
    p_space_id: spaceId, p_date: '2026-07-19', p_content_type: 'image/png', p_size_bytes: 1,
    p_note: `${runId}-boundary`, p_mood: 'happy', p_preferred_timezone: 'Asia/Shanghai',
  });
  assert.equal(preLaunchDateError?.message, 'INVALID_GLIMMER_DATE');
  const existing = await contexts[0].repository.listGlimmers({ spaceId, from: today, to: today, limit: 20 });
  assert.equal(existing.length, 0, 'launch smoke refuses to overwrite real glimmers for today');

  for (const context of contexts) {
    const timezone = context.role === 'ray' ? 'Asia/Shanghai' : 'America/Los_Angeles';
    const mood = context.role === 'ray' ? 'happy' : 'loved';
    const record = await context.repository.uploadGlimmer({ spaceId, date: today, note: `${runId}-${context.role}`, mood,
      preferredTimezone: timezone, file: pngFile(context.role) });
    created.push({ context, id: record.id });
  }

  for (const viewer of contexts) {
    const listed = await viewer.repository.listGlimmers({ spaceId, from: today, to: today, limit: 20 });
    const smoke = listed.filter(({ note }) => note?.startsWith(runId));
    assert.equal(smoke.length, 2, `${viewer.role} must see both glimmers`);
    assert.deepEqual(new Set(smoke.map(({ role }) => role)), new Set(['ray', 'mel']));
    assert.deepEqual(new Set(smoke.map(({ preferred_timezone }) => preferred_timezone)), new Set(['Asia/Shanghai', 'America/Los_Angeles']));
    for (const item of smoke) assert.ok((await viewer.repository.getImageUrl(item.asset)).url, `${viewer.role} receives peer signed image URL`);
  }

  const ray = rayContext;
  const mel = melContext;
  const melItems = await mel.repository.listGlimmers({ spaceId, from: today, to: today, limit: 20 });
  const rayOwned = melItems.find(({ role, note }) => role === 'ray' && note?.startsWith(runId));
  assert.ok(rayOwned, 'Mel must see Ray-owned glimmer before permission check');
  const { error: forbiddenDelete } = await mel.client.rpc('complete_glimmer_delete', { p_id: rayOwned.id });
  assert.equal(forbiddenDelete?.message, 'DELETE_FORBIDDEN');

  const { data: melGiftState, error: melGiftError } = await mel.client.rpc('get_gift_icons_found', { p_space_id: spaceId });
  if (melGiftError) throw melGiftError;
  assert.equal(typeof melGiftState, 'object');
  const { error: rayGiftError } = await ray.client.rpc('get_gift_icons_found', { p_space_id: spaceId });
  assert.equal(rayGiftError?.message, 'FEATURE_FORBIDDEN');

  for (const item of created) {
    const listed = await item.context.repository.listGlimmers({ spaceId, from: today, to: today, limit: 20 });
    await item.context.repository.deleteGlimmer(listed.find(({ id }) => id === item.id));
  }
  created.length = 0;
  console.log(JSON.stringify({ passed: true, runId, members: contexts.map(({ role }) => role), mutualGlimmerReads: 4,
    signedPeerReads: 4, timezones: 2, loginTimezoneDashboards: 2, moods: 2, preLaunchDateRejected: 1,
    crossOwnerDeleteRejected: 1, melGiftRead: 1, rayGiftRejected: 1, cleanup: true }));
} finally {
  for (const item of created) {
    try {
      const listed = await item.context.repository.listGlimmers({ spaceId, from: today, to: today, limit: 20 });
      const record = listed.find(({ id }) => id === item.id); if (record) await item.context.repository.deleteGlimmer(record);
    } catch { /* best effort cleanup */ }
  }
}
