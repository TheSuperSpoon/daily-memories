import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const spaceId = process.env.SPACE_ID ?? '00000000-0000-0000-0000-000000000001';

assert.ok(url && secret, 'SUPABASE_URL and SUPABASE_SECRET_KEY are required');
assert.equal(process.env.CONFIRM_GIFT_RESET, 'RESET_MEL_GIFTS_TO_ZERO', 'explicit gift reset confirmation is required');

const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin
  .from('gift_progress')
  .update({ gift_icons_found: {} })
  .eq('space_id', spaceId)
  .eq('role', 'mel')
  .select('gift_icons_found')
  .single();

if (error) throw error;
const foundCount = Object.values(data.gift_icons_found ?? {}).filter(Boolean).length;
assert.equal(foundCount, 0, 'Mel gift progress must be 0/5 after reset');

console.log(JSON.stringify({ passed: true, role: 'mel', foundCount }));
