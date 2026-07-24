import { IMAGE_TYPES, parseMemoryTags, validateMemoryFile } from './memory-model.js?v=20260724-role-continuity';

export class MemoryRepository {
  constructor({ supabase, storageFactory }) {
    this.supabase = supabase;
    this.storageFactory = storageFactory;
  }

  async uploadMemory({ spaceId, body = '', tags = [], preferredTimezone, file, onProgress }) {
    validateMemoryFile(file);
    if (body.length > 2000) throw this.#localError('MEMORY_BODY_TOO_LONG', 'Memory text must be 2,000 characters or fewer.');
    const parsedTags = Array.isArray(tags) ? parseMemoryTags(tags.join(' ')) : parseMemoryTags(tags);
    const { data: begin, error: beginError } = await this.supabase.rpc('begin_memory_upload', {
      p_space_id: spaceId, p_content_type: file.type, p_size_bytes: file.size,
      p_body: body, p_preferred_timezone: preferredTimezone, p_tags: parsedTags
    });
    if (beginError) throw this.#error(beginError);
    const adapter = this.storageFactory.forAsset(begin.asset);
    onProgress?.({ phase: 'uploading' });
    try {
      await adapter.upload(begin.asset, file);
    } catch (uploadError) {
      const { error: cleanupError } = await this.supabase.rpc('cancel_memory_upload', { p_id: begin.id });
      if (cleanupError) Object.assign(uploadError, { cleanupPending: true, recordId: begin.id });
      throw uploadError;
    }
    onProgress?.({ phase: 'finalizing' });
    const { data, error } = await this.supabase.rpc('finalize_memory_upload', { p_id: begin.id });
    if (error) throw this.#error(error, { retryable: true, recordId: begin.id });
    return data;
  }

  async retryFinalizeMemory(id) {
    const { data, error } = await this.supabase.rpc('finalize_memory_upload', { p_id: id });
    if (error) throw this.#error(error);
    return data;
  }

  async listMemories({ spaceId, from, to, limit = 100 }) {
    const { data, error } = await this.supabase.rpc('list_memories', {
      p_space_id: spaceId, p_from: from, p_to: to, p_limit: limit
    });
    if (error) throw this.#error(error);
    return (data ?? []).map((row) => row.memory ?? row);
  }

  async getLatestMonth(spaceId) {
    const { data, error } = await this.supabase.rpc('get_latest_memory_month', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    return data;
  }

  async getTopTags(spaceId, limit = 5) {
    const { data, error } = await this.supabase.rpc('list_top_memory_tags', { p_space_id: spaceId, p_limit: limit });
    if (error) throw this.#error(error);
    return (data ?? []).map((row) => row.tag ?? row);
  }

  async getReadableUrl(asset, options) {
    return this.storageFactory.forAsset(asset).getReadableUrl(asset, options);
  }

  async deleteMemory(record) {
    await this.storageFactory.forAsset(record.asset).remove(record.asset);
    const { data, error } = await this.supabase.rpc('complete_memory_delete', { p_id: record.id });
    if (error) throw this.#error(error, { retryable: true, recordId: record.id });
    return data;
  }

  async uploadMelLike({ spaceId, label, file, onProgress }) {
    if (!file || !IMAGE_TYPES.includes(file.type)) throw this.#localError('INVALID_CONTENT_TYPE', 'Choose a supported image.');
    validateMemoryFile(file);
    const cleanLabel = label.trim();
    if (!cleanLabel || cleanLabel.length > 60) throw this.#localError('INVALID_MEL_LIKE_LABEL', 'Add a caption up to 60 characters.');
    const { data: begin, error: beginError } = await this.supabase.rpc('begin_mel_like_upload', {
      p_space_id: spaceId, p_content_type: file.type, p_size_bytes: file.size, p_label: cleanLabel
    });
    if (beginError) throw this.#error(beginError);
    const adapter = this.storageFactory.forAsset(begin.asset);
    onProgress?.({ phase: 'uploading' });
    try {
      await adapter.upload(begin.asset, file);
    } catch (uploadError) {
      const { error: cleanupError } = await this.supabase.rpc('cancel_mel_like_upload', { p_id: begin.id });
      if (cleanupError) Object.assign(uploadError, { cleanupPending: true, recordId: begin.id });
      throw uploadError;
    }
    onProgress?.({ phase: 'finalizing' });
    const { data, error } = await this.supabase.rpc('finalize_mel_like_upload', { p_id: begin.id });
    if (error) throw this.#error(error, { retryable: true, recordId: begin.id });
    return data;
  }

  async retryFinalizeMelLike(id) {
    const { data, error } = await this.supabase.rpc('finalize_mel_like_upload', { p_id: id });
    if (error) throw this.#error(error);
    return data;
  }

  async listMelLikes(spaceId) {
    const { data, error } = await this.supabase.rpc('list_mel_likes', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    return (data ?? []).map((row) => row.mel_like ?? row);
  }

  async deleteMelLike(record) {
    await this.storageFactory.forAsset(record.asset).remove(record.asset);
    const { data, error } = await this.supabase.rpc('complete_mel_like_delete', { p_id: record.id });
    if (error) throw this.#error(error, { retryable: true, recordId: record.id });
    return data;
  }

  #localError(code, message) { return Object.assign(new Error(message), { code }); }

  #error(error, details = {}) {
    const message = error?.message || 'Request failed.';
    if (/jwt.*expired|session.*expired|refresh token/i.test(message)) {
      return Object.assign(new Error('Your session has expired. Sign in again.'), { code: 'SESSION_EXPIRED', ...details });
    }
    if (/failed to fetch|network|fetch failed|offline/i.test(message)) {
      return Object.assign(new Error('Network unavailable. Try again.'), { code: 'NETWORK_ERROR', ...details });
    }
    const known = ['NOT_SPACE_MEMBER','INVALID_CONTENT_TYPE','INVALID_FILE_SIZE','INVALID_TIMEZONE',
      'MEMORY_BODY_TOO_LONG','TOO_MANY_TAGS','INVALID_TAG','INVALID_MEL_LIKE_LABEL',
      'DELETE_FORBIDDEN','DELETE_WINDOW_EXPIRED'].find((code) => message.includes(code));
    return Object.assign(new Error(message), { code: known ?? 'BACKEND_ERROR', ...details });
  }
}
