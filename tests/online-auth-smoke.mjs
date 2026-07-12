import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const runId = process.env.TEST_RUN_ID;
const testEmail = process.env.TEST_EMAIL;
if (!url || !key || !runId || !testEmail) throw new Error('Missing online smoke environment.');
const [localPart, domain] = testEmail.split('@');

const requests = Array.from({ length: 3 }, (_, index) => ({
  email: `${localPart}+codex-${runId}-${index + 1}@${domain}`,
  password: `Smoke-${runId}-Aa9!`,
  data: { display_name: `Smoke ${index + 1}` }
}));

const responses = await Promise.all(requests.map(async (body) => {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  return { status: response.status, message: result.msg ?? result.message ?? result.error_code ?? '' };
}));

const successes = responses.filter(({ status }) => status >= 200 && status < 300);
const failures = responses.filter(({ status }) => status >= 400);
assert.equal(successes.length, 2, `expected two signups, received statuses ${responses.map((r) => r.status)}`);
assert.equal(failures.length, 1, `expected one rejected signup, received statuses ${responses.map((r) => r.status)}`);
assert.match(failures[0].message, /REGISTRATION_LIMIT_REACHED|Database error saving new user/i);
console.log(JSON.stringify({ passed: true, successfulSignups: 2, rejectedSignups: 1,
  statuses: responses.map(({ status }) => status) }));
