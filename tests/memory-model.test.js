import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beijingMonthKey, isRoleDeletable, monthRange, parseMemoryTags,
  timePresentation, validateMemoryFile
} from '../js/memory-model.js';

test('memory tags split on whitespace, strip hashes, and deduplicate case-insensitively', () => {
  assert.deepEqual(parseMemoryTags('  #Summer summer 音乐  inside-joke  '), ['Summer', '音乐', 'inside-joke']);
  assert.throws(() => parseMemoryTags(Array.from({ length: 11 }, (_, i) => `t${i}`).join(' ')),
    (error) => error.code === 'TOO_MANY_TAGS');
  assert.throws(() => parseMemoryTags('x'.repeat(25)), (error) => error.code === 'INVALID_TAG');
});

test('month range and Beijing default month are stable', () => {
  assert.deepEqual(monthRange(new Date(2028, 1, 1)), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(beijingMonthKey(new Date('2026-07-31T16:30:00Z')), '2026-08');
});

test('timezone presentation handles day/night and daylight saving independently', () => {
  const instant = '2026-07-20T00:00:00Z';
  assert.deepEqual(timePresentation(instant, 'Asia/Shanghai'), {
    icon: '☀︎', phase: 'day', date: '2026.07.20', time: '08:00'
  });
  assert.equal(timePresentation(instant, 'America/Los_Angeles').time, '17:00');
  assert.equal(timePresentation('2026-01-20T14:00:00Z', 'America/Los_Angeles').phase, 'day');
});

test('memory file validation applies separate image and audio limits', () => {
  assert.equal(validateMemoryFile({ type: 'image/png', size: 10 }), 'image');
  assert.equal(validateMemoryFile({ type: 'audio/mpeg', size: 20 }), 'audio');
  assert.throws(() => validateMemoryFile({ type: 'image/png', size: 10485761 }),
    (error) => error.code === 'INVALID_FILE_SIZE');
  assert.throws(() => validateMemoryFile({ type: 'audio/mpeg', size: 52428801 }),
    (error) => error.code === 'INVALID_FILE_SIZE');
  assert.throws(() => validateMemoryFile({ type: 'video/mp4', size: 1 }),
    (error) => error.code === 'INVALID_CONTENT_TYPE');
});

test('delete visibility follows the role across account replacement and a 24 hour window', () => {
  const now = Date.parse('2026-07-20T12:00:00Z');
  assert.equal(isRoleDeletable({ owner_id: 'deleted-user', role: 'mel', created_at: '2026-07-19T12:00:01Z' }, 'mel', now), true);
  assert.equal(isRoleDeletable({ owner_id: 'deleted-user', role: 'mel', created_at: '2026-07-19T12:00:00Z' }, 'mel', now), false);
  assert.equal(isRoleDeletable({ owner_id: 'new-user', role: 'ray', created_at: '2026-07-20T11:00:00Z' }, 'mel', now), false);
});
