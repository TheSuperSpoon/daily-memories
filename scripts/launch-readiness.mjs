import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
const boundary = process.env.GLIMMER_START_DATE ?? '2026-07-20';
const mode = process.argv[2] ?? 'inventory';

assert.ok(url && secret, 'SUPABASE_URL and SUPABASE_SECRET_KEY are required');
assert.ok(['inventory', 'cleanup'].includes(mode), 'mode must be inventory or cleanup');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function rows(table, columns, configure = (query) => query) {
  const { data, error } = await configure(admin.from(table).select(columns));
  if (error) throw error;
  return data;
}

async function count(table, configure = (query) => query) {
  const { count: value, error } = await configure(admin.from(table).select('*', { count: 'exact', head: true }));
  if (error) throw error;
  return value ?? 0;
}

const members = await rows('space_members', 'user_id,role', (query) => query.eq('space_id', spaceId));
const memberByRole = Object.fromEntries(members.map((member) => [member.role, member]));
const slots = await rows('registration_slots', 'role,state,user_id,claimed_at', (query) => query.order('slot'));
const melGiftProgress = await rows('gift_progress', 'gift_icons_found', (query) =>
  query.eq('space_id', spaceId).eq('role', 'mel'));
const melGiftIcons = melGiftProgress[0]?.gift_icons_found ?? {};
const inventory = {
  memberRoles: members.map(({ role }) => role).sort(),
  slots: Object.fromEntries(slots.map(({ role, state }) => [role, state])),
  glimmers: await count('glimmers', (query) => query.eq('space_id', spaceId)),
  glimmersBeforeBoundary: await count('glimmers', (query) => query.eq('space_id', spaceId).lt('glimmer_date', boundary)),
  memories: await count('memories', (query) => query.eq('space_id', spaceId)),
  melLikes: await count('mel_likes', (query) => query.eq('space_id', spaceId)),
  memoryTags: await count('memory_tags', (query) => query.eq('space_id', spaceId)),
  melGiftFound: Object.values(melGiftIcons).filter(Boolean).length,
};

if (mode === 'inventory') {
  console.log(JSON.stringify({ passed: true, mode, boundary, ...inventory }));
  process.exit(0);
}

assert.equal(process.env.CONFIRM_LAUNCH_CLEANUP, `DELETE_MEL_AND_BEFORE_${boundary}`, 'explicit cleanup confirmation is required');
assert.ok(memberByRole.ray, 'Ray membership must remain intact');
assert.ok(memberByRole.mel, 'exactly one Mel membership is required before cleanup');
const melId = memberByRole.mel.user_id;

const glimmers = await rows('glimmers', 'id,owner_id,glimmer_date,glimmer_assets(bucket,object_key)', (query) =>
  query.eq('space_id', spaceId).or(`owner_id.eq.${melId},glimmer_date.lt.${boundary}`));
const memories = await rows('memories', 'id,memory_assets(bucket,object_key)', (query) =>
  query.eq('space_id', spaceId).eq('owner_id', melId));
const deletedMemories = await rows('memories', 'id,body,deleted_at,memory_assets(bucket,object_key)', (query) =>
  query.eq('space_id', spaceId).not('deleted_at', 'is', null));
const testHistoryMemories = deletedMemories.filter(({ body }) =>
  /^(QA random (audio|image) |launch-ui-memory-ray-)/i.test(body ?? ''));
const allLikes = await rows('mel_likes', 'id,position,owner_id,mel_like_assets(bucket,object_key)', (query) =>
  query.eq('space_id', spaceId));
const melLikes = allLikes.filter(({ owner_id }) => owner_id === melId);
const seededLikes = allLikes.filter(({ id, position, mel_like_assets: likeAssets = [] }) =>
  position >= 1 && position <= 9 && id.startsWith('61000000-0000-0000-0000-')
    && likeAssets.some(({ object_key }) => object_key?.includes('/mel-likes/seed/')));
const likesToDelete = melLikes.filter(({ id }) => !seededLikes.some((seeded) => seeded.id === id));

const assets = [
  ...glimmers.flatMap(({ glimmer_assets = [] }) => glimmer_assets),
  ...memories.flatMap(({ memory_assets = [] }) => memory_assets),
  ...testHistoryMemories.flatMap(({ memory_assets = [] }) => memory_assets),
  ...likesToDelete.flatMap(({ mel_like_assets = [] }) => mel_like_assets),
].filter(({ bucket, object_key }) => bucket && object_key);

for (const bucket of new Set(assets.map(({ bucket: value }) => value))) {
  const objectKeys = [...new Set(assets.filter((asset) => asset.bucket === bucket).map((asset) => asset.object_key))];
  if (objectKeys.length === 0) continue;
  const { error } = await admin.storage.from(bucket).remove(objectKeys);
  if (error) throw error;
}

let response = await admin.from('glimmers').delete().eq('space_id', spaceId).lt('glimmer_date', boundary);
if (response.error) throw response.error;
if (testHistoryMemories.length) {
  response = await admin.from('memories').delete().in('id', testHistoryMemories.map(({ id }) => id));
  if (response.error) throw response.error;
}
assert.equal(seededLikes.length, 9, 'all nine seeded Mel likes must be preserved');
response = await admin.from('mel_likes').update({ owner_id: memberByRole.ray.user_id, role: 'ray' })
  .in('id', seededLikes.map(({ id }) => id));
if (response.error) throw response.error;
response = await admin.from('reward_ledger').delete().eq('space_id', spaceId).eq('actor_id', melId);
if (response.error) throw response.error;
response = await admin.from('gift_progress').update({ gift_icons_found: {} }).eq('space_id', spaceId).eq('role', 'mel');
if (response.error) throw response.error;
response = await admin.from('registration_slots').update({ state: 'open', user_id: null, claimed_at: null }).eq('role', 'mel').eq('user_id', melId);
if (response.error) throw response.error;

const { error: deleteUserError } = await admin.auth.admin.deleteUser(melId, false);
if (deleteUserError) throw deleteUserError;

const allTags = await rows('memory_tags', 'id', (query) => query.eq('space_id', spaceId));
const tagLinks = allTags.length
  ? await rows('memory_tag_links', 'tag_id', (query) => query.in('tag_id', allTags.map(({ id }) => id)))
  : [];
const linkedTagIds = new Set(tagLinks.map(({ tag_id }) => tag_id));
const orphanTagIds = allTags.filter(({ id }) => !linkedTagIds.has(id)).map(({ id }) => id);
if (orphanTagIds.length) {
  response = await admin.from('memory_tags').delete().in('id', orphanTagIds);
  if (response.error) throw response.error;
}

const remainingMembers = await rows('space_members', 'user_id,role', (query) => query.eq('space_id', spaceId));
const remainingSlots = await rows('registration_slots', 'role,state,user_id', (query) => query.order('slot'));
const verification = {
  memberRoles: remainingMembers.map(({ role }) => role).sort(),
  melSlot: remainingSlots.find(({ role }) => role === 'mel'),
  glimmersBeforeBoundary: await count('glimmers', (query) => query.eq('space_id', spaceId).lt('glimmer_date', boundary)),
  melOwnedGlimmers: await count('glimmers', (query) => query.eq('space_id', spaceId).eq('owner_id', melId)),
  melOwnedMemories: await count('memories', (query) => query.eq('space_id', spaceId).eq('owner_id', melId)),
  melOwnedLikes: await count('mel_likes', (query) => query.eq('space_id', spaceId).eq('owner_id', melId)),
  seededLikesOwnedByRay: await count('mel_likes', (query) => query.eq('space_id', spaceId)
    .eq('owner_id', memberByRole.ray.user_id).gte('position', 1).lte('position', 9)),
  removedOrphanTags: orphanTagIds.length,
  testHistoryMemories: await count('memories', (query) => query.eq('space_id', spaceId)
    .or('body.like.QA random audio %,body.like.QA random image %,body.like.launch-ui-memory-ray-%')),
  memoryTags: await count('memory_tags', (query) => query.eq('space_id', spaceId)),
  melGiftFound: Object.values((await rows('gift_progress', 'gift_icons_found', (query) =>
    query.eq('space_id', spaceId).eq('role', 'mel')))[0]?.gift_icons_found ?? {}).filter(Boolean).length,
};

assert.deepEqual(verification.memberRoles, ['ray']);
assert.equal(verification.melSlot?.state, 'open');
assert.equal(verification.melSlot?.user_id, null);
assert.equal(verification.glimmersBeforeBoundary, 0);
assert.equal(verification.melOwnedGlimmers, 0);
assert.equal(verification.melOwnedMemories, 0);
assert.equal(verification.melOwnedLikes, 0);
assert.equal(verification.seededLikesOwnedByRay, 9);
assert.equal(verification.testHistoryMemories, 0);
assert.equal(verification.memoryTags, 0);
assert.equal(verification.melGiftFound, 0);

console.log(JSON.stringify({ passed: true, mode, boundary, removedAssets: assets.length, verification }));
