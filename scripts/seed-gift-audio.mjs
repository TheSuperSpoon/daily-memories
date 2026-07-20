import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';
const sourcePath = process.env.GIFT_AUDIO_FILE ?? 'In Loving Memory.MP3';
const bucket = 'gifts';
const objectKey = `spaces/${spaceId}/in-loving-memory.mp3`;

assert.ok(url && secret, 'SUPABASE_URL and SUPABASE_SECRET_KEY are required');
const bytes = await readFile(sourcePath);
assert.ok(bytes.length > 0 && bytes.length <= 50 * 1024 * 1024, 'Gift audio must be 50 MiB or smaller');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

function tusMetadata(values) {
  return Object.entries(values).map(([key, value]) => `${key} ${Buffer.from(value).toString('base64')}`).join(',');
}

async function resumableUpload() {
  const projectRef = new URL(url).hostname.split('.')[0];
  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  const headers = {
    Authorization: `Bearer ${secret}`,
    apikey: secret,
    'Tus-Resumable': '1.0.0',
  };
  const creation = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Upload-Length': String(bytes.length),
      'Upload-Metadata': tusMetadata({
        bucketName: bucket,
        objectName: objectKey,
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      }),
      'x-upsert': 'true',
    },
  });
  if (!creation.ok) throw new Error(`Resumable upload creation failed: ${creation.status} ${await creation.text()}`);
  const location = creation.headers.get('location');
  if (!location) throw new Error('Resumable upload location was not returned');
  const uploadUrl = new URL(location, endpoint).href;
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  while (offset < bytes.length) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: chunk,
    });
    if (!response.ok) throw new Error(`Resumable upload failed at ${offset}: ${response.status} ${await response.text()}`);
    const nextOffset = Number(response.headers.get('upload-offset'));
    offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + chunk.length;
  }
}

await resumableUpload();

const { error: metadataError } = await admin.from('gift_assets').upsert({
  id: 'in-loving-memory',
  space_id: spaceId,
  title: 'In Loving Memory',
  bucket,
  object_key: objectKey,
  content_type: 'audio/mpeg',
  size_bytes: bytes.length,
  sha256,
  is_active: true,
  updated_at: new Date().toISOString(),
}, { onConflict: 'id' });
if (metadataError) throw metadataError;

const { data: signed, error: signError } = await admin.storage.from(bucket).createSignedUrl(objectKey, 60);
if (signError || !signed?.signedUrl) throw signError ?? new Error('Signed verification URL was not created');
const verification = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-1023' } });
assert.ok(verification.ok, `Gift audio verification failed with ${verification.status}`);

console.log(JSON.stringify({ passed: true, bucket, objectKey, sizeBytes: bytes.length, sha256 }));
