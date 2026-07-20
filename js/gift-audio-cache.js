const CACHE_NAME = 'daily-memories-gift-audio-v1';

export function giftAudioCacheKey(audio, origin = globalThis.location?.origin ?? 'http://localhost') {
  if (!audio?.id || !audio?.sha256) throw new Error('Gift audio cache metadata is incomplete.');
  return new URL(`/__gift-audio-cache__/${audio.id}-${audio.sha256}`, origin).href;
}

export async function resolveGiftAudioSource(audio, dependencies = {}) {
  const cacheStorage = dependencies.cacheStorage ?? globalThis.caches;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const createObjectURL = dependencies.createObjectURL ?? ((blob) => URL.createObjectURL(blob));
  const origin = dependencies.origin ?? globalThis.location?.origin ?? 'http://localhost';
  const cacheKey = giftAudioCacheKey(audio, origin);
  const cache = cacheStorage ? await cacheStorage.open(CACHE_NAME) : null;
  const cached = cache ? await cache.match(cacheKey) : null;

  if (cached?.ok) {
    const blob = await cached.blob();
    if (!audio.asset?.size_bytes || blob.size === audio.asset.size_bytes) {
      return { url: createObjectURL(blob), source: 'cache', sizeBytes: blob.size, cacheKey };
    }
    await cache.delete(cacheKey);
  }

  if (!audio.url) throw new Error('Gift audio download URL is missing.');
  const response = await fetchImpl(audio.url);
  if (!response.ok) throw new Error(`Gift audio download failed with ${response.status}.`);
  const blob = await response.blob();
  if (audio.asset?.size_bytes && blob.size !== audio.asset.size_bytes) {
    throw new Error('Gift audio download was incomplete.');
  }

  if (cache) {
    await cache.put(cacheKey, new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': audio.asset?.content_type ?? 'audio/mpeg',
        'Content-Length': String(blob.size),
        'X-Gift-Audio-SHA256': audio.sha256,
      },
    }));
  }
  return { url: createObjectURL(blob), source: cache ? 'supabase-cached' : 'supabase', sizeBytes: blob.size, cacheKey };
}

export async function clearGiftAudioCache(cacheStorage = globalThis.caches) {
  if (!cacheStorage) return false;
  return cacheStorage.delete(CACHE_NAME);
}

export { CACHE_NAME as GIFT_AUDIO_CACHE_NAME };
