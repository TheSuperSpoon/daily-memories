import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
if (!url || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY before seeding Mel likes.');

const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const items = [
  ['jinx.png', 'Jinx'], ['yoru.jpg', 'Yoru / Valorant'], ['fleabag.jpg', 'Fleabag'],
  ['dead-poets.jpg', 'Dead Poets Society'], ['the-strokes.jpg', 'The Strokes'], ['gojira.jpg', 'Gojira'],
  ['cyberpunk.jpeg', 'Cyberpunk: Edgerunners'], ['omori.jpg', 'OMORI'], ['nana.jpg', 'NANA'],
];
const contentTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const { data: member, error: memberError } = await client.from('space_members')
  .select('user_id,role').eq('space_id', spaceId).order('role', { ascending: false }).limit(1).single();
if (memberError || !member) throw new Error(`Cannot find a member for the target space: ${memberError?.message ?? 'missing member'}`);

for (let index = 0; index < items.length; index += 1) {
  const [filename, label] = items[index];
  const position = index + 1;
  const suffix = String(position).padStart(12, '0');
  const likeId = `61000000-0000-0000-0000-${suffix}`;
  const assetId = `62000000-0000-0000-0000-${suffix}`;
  const extension = extname(filename).toLowerCase();
  const contentType = contentTypes[extension];
  const objectKey = `spaces/${spaceId}/mel-likes/seed/${String(position).padStart(2, '0')}-${filename}`;
  const bytes = await readFile(join(process.cwd(), 'assets', filename));
  const upload = await client.storage.from('memories').upload(objectKey, bytes, { contentType, upsert: false });
  if (upload.error && !/duplicate|already exists|resource already exists/i.test(upload.error.message)) {
    throw new Error(`Upload failed for ${filename}: ${upload.error.message}`);
  }
  const { error: likeError } = await client.from('mel_likes').upsert({
    id: likeId, space_id: spaceId, owner_id: member.user_id, role: member.role,
    label, position, status: 'ready', ready_at: new Date().toISOString(), deleted_at: null,
  }, { onConflict: 'id' });
  if (likeError) throw new Error(`Metadata failed for ${filename}: ${likeError.message}`);
  const { error: assetError } = await client.from('mel_like_assets').upsert({
    id: assetId, mel_like_id: likeId, provider: 'supabase', bucket: 'memories', object_key: objectKey,
    content_type: contentType, size_bytes: bytes.byteLength, is_current: true, deleted_at: null,
  }, { onConflict: 'id' });
  if (assetError) throw new Error(`Asset metadata failed for ${filename}: ${assetError.message}`);
}

const { data: seeded, error: verifyError } = await client.from('mel_likes')
  .select('position,label,mel_like_assets(object_key)').eq('space_id', spaceId).is('deleted_at', null).order('position');
if (verifyError) throw new Error(`Seed verification failed: ${verifyError.message}`);
if (seeded.length < items.length) throw new Error(`Expected at least ${items.length} Mel likes, found ${seeded.length}.`);
console.log(JSON.stringify({ seeded: items.length, verified: seeded.slice(0, items.length).map(({ position, label }) => ({ position, label })) }));
process.exit(0);
