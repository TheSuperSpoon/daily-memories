import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const runId = process.env.TEST_RUN_ID;
const [localPart, domain] = process.env.TEST_EMAIL.split('@');
const password = `Smoke-${runId}-Aa9!`;
const headers = { apikey: key, 'Content-Type': 'application/json' };

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const result = Buffer.alloc(4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return result;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  return Buffer.concat([length, name, data, crc32(Buffer.concat([name, data]))]);
}
function randomPng() {
  const width = 16; const height = 16; const rows = [];
  const pixels = randomBytes(width * height * 3);
  for (let y = 0; y < height; y += 1) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * width * 3, (y + 1) * width * 3)]));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
async function jsonFetch(path, options = {}) {
  const response = await fetch(`${url}${path}`, options); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.message ?? body.msg ?? body.error ?? ''}`);
  return body;
}
async function rpc(session, name, body) {
  return jsonFetch(`/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
}

const candidates = Array.from({ length: 3 }, (_, i) => `${localPart}+codex-${runId}-${i + 1}@${domain}`);
const loginAttempts = await Promise.all(candidates.map(async (email) => {
  try {
    const session = await jsonFetch('/auth/v1/token?grant_type=password', { method: 'POST', headers, body: JSON.stringify({ email, password }) });
    return { ok: true, email, session };
  } catch (error) { return { ok: false, email, error: error.message }; }
}));
const sessions = loginAttempts.filter(({ ok }) => ok).map(({ email, session }) => ({ email, ...session }));
assert.equal(sessions.length, 2, `exactly two test users must sign in: ${JSON.stringify(loginAttempts.filter(({ ok }) => !ok).map(({ error }) => error))}`);

const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const spaceId = '00000000-0000-0000-0000-000000000001';
const glimmers = [];
for (const [index, session] of sessions.entries()) {
  const png = randomPng();
  const begin = await rpc(session, 'begin_glimmer_upload', { p_space_id: spaceId, p_date: date,
    p_content_type: 'image/png', p_size_bytes: png.length, p_note: `random smoke ${runId}-${index + 1}` });
  const asset = begin.asset; const encodedKey = asset.object_key.split('/').map(encodeURIComponent).join('/');
  const upload = await fetch(`${url}/storage/v1/object/${asset.bucket}/${encodedKey}`, { method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: png });
  if (!upload.ok) throw new Error(`owner upload failed: ${upload.status} ${await upload.text()}`);
  await rpc(session, 'finalize_glimmer_upload', { p_id: begin.id });
  glimmers.push({ id: begin.id, asset, session });
}

for (const session of sessions) {
  const listed = await rpc(session, 'list_glimmers', { p_space_id: spaceId, p_from: date, p_to: date, p_limit: 50 });
  assert.equal(listed.length, 2, 'each member must list both ready glimmers');
  for (const item of glimmers) {
    const encodedKey = item.asset.object_key.split('/').map(encodeURIComponent).join('/');
    const read = await fetch(`${url}/storage/v1/object/authenticated/${item.asset.bucket}/${encodedKey}`, {
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}` }
    });
    assert.equal(read.status, 200, 'space peer must read ready object');
  }
}

const чужой = glimmers[1];
const forbidden = await fetch(`${url}/storage/v1/object/${чужой.asset.bucket}`, { method: 'DELETE',
  headers: { ...headers, Authorization: `Bearer ${sessions[0].access_token}` },
  body: JSON.stringify({ prefixes: [чужой.asset.object_key] }) });
assert.ok(forbidden.status === 400 || forbidden.status === 403, `cross-owner delete unexpectedly returned ${forbidden.status}`);

for (const item of glimmers) {
  const removed = await fetch(`${url}/storage/v1/object/${item.asset.bucket}`, { method: 'DELETE',
    headers: { ...headers, Authorization: `Bearer ${item.session.access_token}` },
    body: JSON.stringify({ prefixes: [item.asset.object_key] }) });
  assert.ok(removed.ok, `owner delete failed: ${removed.status}`);
  await rpc(item.session, 'complete_glimmer_delete', { p_id: item.id });
}
console.log(JSON.stringify({ passed: true, signedIn: 2, uploaded: 2, peerReads: 4,
  forbiddenDeletes: 1, ownerDeletes: 2 }));
