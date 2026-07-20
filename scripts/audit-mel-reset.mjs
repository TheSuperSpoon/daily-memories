import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
const formerMelEmail = (process.env.FORMER_MEL_EMAIL ?? '').trim().toLowerCase();

assert.ok(url && secret, 'SUPABASE_URL and SUPABASE_SECRET_KEY are required');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function rows(table, columns, configure = (query) => query) {
  const { data, error } = await configure(admin.from(table).select(columns));
  if (error) throw error;
  return data;
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function listStorageFiles(bucket, prefix) {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push({ bucket, path, ownerId: item.owner_id ?? item.owner ?? null });
      else files.push(...await listStorageFiles(bucket, path));
    }
    if (data.length < 100) break;
  }
  return files;
}

const [authUsers, profiles, members, slots, glimmers, memories, likes, rewards, gifts, tags] = await Promise.all([
  listAuthUsers(),
  rows('profiles', 'user_id,display_name'),
  rows('space_members', 'user_id,role', (query) => query.eq('space_id', spaceId)),
  rows('registration_slots', 'role,state,user_id,claimed_at', (query) => query.order('slot')),
  rows('glimmers', 'id,owner_id,role,note,glimmer_date,status,deleted_at,glimmer_assets(bucket,object_key)', (query) => query.eq('space_id', spaceId)),
  rows('memories', 'id,owner_id,role,body,status,deleted_at,created_at,memory_assets(bucket,object_key),memory_tag_links(memory_tags(display_name))', (query) => query.eq('space_id', spaceId)),
  rows('mel_likes', 'id,owner_id,role,label,status,deleted_at,position,mel_like_assets(bucket,object_key)', (query) => query.eq('space_id', spaceId)),
  rows('reward_ledger', 'id,event_type,amount,actor_id', (query) => query.eq('space_id', spaceId)),
  rows('gift_progress', 'role,gift_icons_found', (query) => query.eq('space_id', spaceId)),
  rows('memory_tags', 'id,display_name,normalized_name', (query) => query.eq('space_id', spaceId)),
]);

const storageFiles = [
  ...await listStorageFiles('glimmers', `spaces/${spaceId}`),
  ...await listStorageFiles('memories', `spaces/${spaceId}`),
];
const storagePathSet = new Set(storageFiles.map(({ bucket, path }) => `${bucket}/${path}`));
const memberIds = new Set(members.map(({ user_id }) => user_id));
const userPathPattern = /\/users\/([0-9a-f-]{36})(?:\/|$)/i;
const staleUserStorage = storageFiles.filter(({ path }) => {
  const userId = path.match(userPathPattern)?.[1];
  return userId && !memberIds.has(userId);
});
const melGiftState = gifts.find(({ role }) => role === 'mel')?.gift_icons_found ?? {};
const melSlot = slots.find(({ role }) => role === 'mel');
const roleRows = {
  spaceMembers: members.filter(({ role }) => role === 'mel').length,
  glimmers: glimmers.filter(({ role }) => role === 'mel').length,
  memories: memories.filter(({ role }) => role === 'mel').length,
  melLikes: likes.filter(({ role }) => role === 'mel').length,
};
const testTextPattern = /(?:^|\b)(?:launch-|online (?:image|audio)|random smoke|qa glimmer|smoke-|sharedqa|launchlist)/i;
const testMemories = memories.filter(({ body, memory_tag_links = [] }) =>
  testTextPattern.test(body ?? '') || memory_tag_links.some(({ memory_tags }) => testTextPattern.test(memory_tags?.display_name ?? '')));
const testGlimmers = glimmers.filter(({ note }) => testTextPattern.test(note ?? ''));
const testLikes = likes.filter(({ label }) => /^(?:smoke favorite|launch-)/i.test(label ?? ''));
const deletedMemoryObjectsPresent = memories.flatMap(({ id, deleted_at, memory_assets = [] }) =>
  deleted_at
    ? memory_assets.filter(({ bucket, object_key }) => storagePathSet.has(`${bucket}/${object_key}`))
      .map(({ bucket, object_key }) => ({ memoryId: id, bucket, objectKey: object_key }))
    : []);
const userStorageFiles = storageFiles.filter(({ path }) => userPathPattern.test(path));

const result = {
  passed: true,
  melInitialState: {
    authAccountMatches: formerMelEmail
      ? authUsers.filter(({ email }) => email?.toLowerCase() === formerMelEmail).length
      : null,
    melNamedProfiles: profiles.filter(({ display_name }) => /^mel$/i.test(display_name.trim())).length,
    slot: { state: melSlot?.state ?? null, hasUserId: Boolean(melSlot?.user_id), claimedAt: melSlot?.claimed_at ?? null },
    roleRows,
    giftFound: Object.values(melGiftState).filter(Boolean).length,
    rewardRows: rewards.length,
    rewardBalance: rewards.reduce((sum, { amount }) => sum + amount, 0),
    staleUserStorageObjects: staleUserStorage.length,
    userStorageObjects: userStorageFiles.length,
    deletedMemoryObjectsPresent: deletedMemoryObjectsPresent.length,
    pendingUploads: {
      glimmers: glimmers.filter(({ status }) => status === 'pending').length,
      memories: memories.filter(({ status }) => status === 'pending').length,
      melLikes: likes.filter(({ status }) => status === 'pending').length,
    },
    softDeletedRows: {
      glimmers: glimmers.filter(({ deleted_at }) => deleted_at).length,
      memories: memories.filter(({ deleted_at }) => deleted_at).length,
      melLikes: likes.filter(({ deleted_at }) => deleted_at).length,
    },
    recognizableTestRecords: {
      glimmers: testGlimmers.length,
      memories: testMemories.length,
      melLikes: testLikes.length,
    },
  },
  retainedSharedContent: {
    rayOwnedMelLikes: likes.filter(({ role, deleted_at }) => role === 'ray' && !deleted_at).length,
    seededMelLikes: likes.filter(({ position }) => position >= 1 && position <= 9).length,
  },
  details: {
    staleUserStorage: staleUserStorage.map(({ bucket, path }) => ({ bucket, path })),
    giftIds: Object.entries(melGiftState).filter(([, found]) => found).map(([id]) => id).sort(),
    testGlimmers: testGlimmers.map(({ id, role, note, glimmer_date }) => ({ id, role, note, glimmer_date })),
    testMemories: testMemories.map(({ id, role, body, memory_tag_links = [], memory_assets = [] }) => ({
      id,
      role,
      body,
      tags: memory_tag_links.map(({ memory_tags }) => memory_tags?.display_name).filter(Boolean),
      assets: memory_assets.map(({ bucket, object_key }) => ({ bucket, object_key })),
    })),
    testMelLikes: testLikes.map(({ id, role, label, position }) => ({ id, role, label, position })),
    allMemoryTags: tags.map(({ display_name }) => display_name).sort(),
    allMemories: memories.map(({ id, role, body, status, deleted_at, memory_tag_links = [] }) => ({
      id,
      role,
      body,
      status,
      deleted: Boolean(deleted_at),
      tags: memory_tag_links.map(({ memory_tags }) => memory_tags?.display_name).filter(Boolean),
    })),
    deletedMemoryObjectsPresent,
    userStorageFiles: userStorageFiles.map(({ bucket, path }) => ({ bucket, path })),
  },
};

console.log(JSON.stringify(result));
