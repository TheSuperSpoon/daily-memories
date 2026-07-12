import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const keys = JSON.parse(process.env.OBJECT_KEYS ?? '[]');
assert.ok(url && secret && keys.length, 'missing orphan cleanup environment');
const response = await fetch(`${url}/storage/v1/object/glimmers`, {
  method: 'DELETE',
  headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefixes: keys })
});
const body = await response.json().catch(() => ({}));
assert.ok(response.ok, `admin object cleanup failed (${response.status}): ${body.message ?? body.error ?? ''}`);
console.log(JSON.stringify({ passed: true, removedObjects: keys.length }));
