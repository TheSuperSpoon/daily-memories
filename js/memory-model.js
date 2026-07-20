export const IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const AUDIO_TYPES = Object.freeze(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg']);
export const TIMEZONES = Object.freeze(['Asia/Shanghai', 'America/Los_Angeles']);

export function parseMemoryTags(value) {
  const seen = new Set();
  const tags = [];
  String(value ?? '').split(/\s+/u).forEach((part) => {
    const display = part.replace(/^#+/u, '').trim();
    if (!display) return;
    if ([...display].length > 24) throw Object.assign(new Error('Each tag must be 24 characters or fewer.'), { code: 'INVALID_TAG' });
    const key = display.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(display);
  });
  if (tags.length > 10) throw Object.assign(new Error('Use no more than 10 tags.'), { code: 'TOO_MANY_TAGS' });
  return tags;
}

export function monthFromKey(key) {
  const [year, month] = String(key).split('-').map(Number);
  return new Date(year, month - 1, 1);
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    to: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function beijingMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}`;
}

export function localTimeParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function timePresentation(value, timeZone) {
  const parts = localTimeParts(value, timeZone);
  const hour = Number(parts.hour);
  return {
    icon: hour >= 6 && hour < 18 ? '☀︎' : '☾',
    phase: hour >= 6 && hour < 18 ? 'day' : 'night',
    date: `${parts.year}.${parts.month}.${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function isOwnerDeletable(record, userId, nowMs = Date.now()) {
  return Boolean(record?.owner_id === userId
    && new Date(record.created_at).getTime() > nowMs - 86400000);
}

export function validateMemoryFile(file) {
  if (!file || (!IMAGE_TYPES.includes(file.type) && !AUDIO_TYPES.includes(file.type))) {
    throw Object.assign(new Error('Choose a supported image or audio file.'), { code: 'INVALID_CONTENT_TYPE' });
  }
  const max = IMAGE_TYPES.includes(file.type) ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size < 1 || file.size > max) {
    throw Object.assign(new Error(IMAGE_TYPES.includes(file.type)
      ? 'Image must be 10 MiB or smaller.' : 'Audio must be 50 MiB or smaller.'), { code: 'INVALID_FILE_SIZE' });
  }
  return IMAGE_TYPES.includes(file.type) ? 'image' : 'audio';
}

