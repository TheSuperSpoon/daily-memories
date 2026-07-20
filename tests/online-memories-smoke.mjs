import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { MemoryRepository } from '../js/memory-repository.js';
import { StorageAdapterFactory } from '../js/storage/storage-adapter-factory.js';
import { SupabaseStorageAdapter } from '../js/storage/supabase-storage-adapter.js';

const url = process.env.SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
assert.ok(url && publishable && secret, 'Supabase URL, publishable key, and secret key are required');
const runId = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const smokeTag = `smoke-${randomBytes(4).toString('hex')}`;
const keepMemories = process.env.KEEP_SMOKE_MEMORIES === '1';
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  const result = Buffer.alloc(4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return result;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  return Buffer.concat([length, name, data, crc32(Buffer.concat([name, data]))]);
}
function pngFile() {
  const width = 12; const height = 12; const pixels = randomBytes(width * height * 3); const rows = [];
  for (let y = 0; y < height; y += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 3, (y + 1) * width * 3)]));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return new File([bytes], `memory-${runId}.png`, { type: 'image/png' });
}
function wavFile() {
  const samples = 8000; const data = Buffer.alloc(samples * 2); const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return new File([Buffer.concat([header, data])], `voice-${runId}.wav`, { type: 'audio/wav' });
}
function repositoryFor(client) {
  const adapter = new SupabaseStorageAdapter(client);
  return new MemoryRepository({ supabase: client, storageFactory: new StorageAdapterFactory({ supabase: adapter }) });
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
assert.equal(members.length, 2, 'the shared space must have two members');
const contexts = [];
const created = [];
let createdLike = null;
try {
  for (const member of members) {
    const client = await sessionForUser(member.user_id);
    contexts.push({ ...member, client, repository: repositoryFor(client) });
  }
  const imageContext = keepMemories ? contexts.find(({ role }) => role === 'ray') : contexts[0];
  const audioContext = keepMemories ? imageContext : contexts[1];
  const image = await imageContext.repository.uploadMemory({ spaceId, body: `online image ${runId}`,
    tags: [smokeTag, 'shared'], preferredTimezone: 'Asia/Shanghai', file: pngFile() });
  created.push({ context: imageContext, id: image.id });
  const audio = await audioContext.repository.uploadMemory({ spaceId, body: `online audio ${runId}`,
    tags: [smokeTag, 'shared'], preferredTimezone: 'America/Los_Angeles', file: wavFile() });
  created.push({ context: audioContext, id: audio.id });
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date());
  const [year, monthNumber] = month.split('-').map(Number); const last = new Date(year, monthNumber, 0).getDate();
  for (const context of contexts) {
    const listed = await context.repository.listMemories({ spaceId, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, limit: 200 });
    const smoke = listed.filter((item) => item.body?.endsWith(runId));
    assert.equal(smoke.length, 2, 'each member lists both uploaded smoke memories');
    assert.deepEqual(new Set(smoke.map((item) => item.role)), new Set(keepMemories ? ['ray'] : ['ray', 'mel']));
    for (const item of smoke) assert.ok((await context.repository.getReadableUrl(item.asset)).url, 'peer receives a signed media URL');
  }
  const topTags = await contexts[0].repository.getTopTags(spaceId, 20);
  assert.equal(topTags.find((item) => item.name === smokeTag)?.count, 2);
  if (!keepMemories) {
    createdLike = await contexts[0].repository.uploadMelLike({ spaceId, label: `Smoke favorite ${runId}`.slice(0, 60), file: pngFile() });
    const likes = await contexts[1].repository.listMelLikes(spaceId);
    assert.ok(likes.some((item) => item.id === createdLike.id), 'peer lists the tenth temporary Mel like');
    const likeRecord = likes.find((item) => item.id === createdLike.id);
    await contexts[0].repository.deleteMelLike(likeRecord);
    createdLike = null;
    for (const item of created) {
      const range = await item.context.repository.listMemories({ spaceId, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, limit: 200 });
      await item.context.repository.deleteMemory(range.find((record) => record.id === item.id));
    }
    created.length = 0;
  }
  console.log(JSON.stringify({ passed: true, runId, smokeTag, memoryIds: created.map(({ id }) => id), members: contexts.map(({ role }) => role), uploadedMemories: 2, peerReads: 4, topTagCount: 2, temporaryMelLike: keepMemories ? 0 : 1, cleanup: !keepMemories }));
} finally {
  if (!keepMemories) {
    for (const item of created) {
      try {
        const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date());
        const [year, number] = month.split('-').map(Number); const last = new Date(year, number, 0).getDate();
        const records = await item.context.repository.listMemories({ spaceId, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, limit: 200 });
        const record = records.find(({ id }) => id === item.id); if (record) await item.context.repository.deleteMemory(record);
      } catch { /* best effort cleanup */ }
    }
    if (createdLike) {
      try {
        const owner = contexts[0]; const likes = await owner.repository.listMelLikes(spaceId);
        const record = likes.find(({ id }) => id === createdLike.id); if (record) await owner.repository.deleteMelLike(record);
      } catch { /* best effort cleanup */ }
    }
  }
}
