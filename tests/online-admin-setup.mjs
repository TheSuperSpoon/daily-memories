import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const runId = process.env.TEST_RUN_ID;
const [localPart, domain] = process.env.TEST_EMAIL.split('@');
assert.ok(url && secret && runId, 'missing admin smoke environment');

for (let index = 1; index <= 2; index += 1) {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${localPart}+codex-${runId}-${index}@${domain}`,
      password: `Smoke-${runId}-Aa9!`, email_confirm: true,
      user_metadata: { display_name: `Smoke ${index}` } })
  });
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok, `admin user ${index} failed (${response.status}): ${body.message ?? body.msg ?? ''}`);
}
console.log(JSON.stringify({ passed: true, adminUsersCreated: 2 }));
