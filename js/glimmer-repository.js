export class GlimmerRepository {
  constructor({ supabase, storageFactory }) {
    this.supabase = supabase;
    this.storageFactory = storageFactory;
  }

  async signUp({ email, password, displayName }) {
    const { data, error } = await this.supabase.auth.signUp({
      email, password, options: { data: { display_name: displayName.trim() } }
    });
    if (error) throw this.#error(error);
    return data;
  }

  async signIn(email, password) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw this.#error(error);
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw this.#error(error);
  }

  async resetPassword(email, redirectTo) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw this.#error(error);
  }

  async getSession() {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw this.#error(error);
    return data.session;
  }

  onAuthStateChange(callback) {
    return this.supabase.auth.onAuthStateChange(callback).data.subscription;
  }

  async uploadGlimmer({ spaceId, date, note = '', file, onProgress }) {
    this.#validateFile(file);
    const { data: begin, error: beginError } = await this.supabase.rpc('begin_glimmer_upload', {
      p_space_id: spaceId, p_date: date, p_content_type: file.type,
      p_size_bytes: file.size, p_note: note
    });
    if (beginError) throw this.#error(beginError);
    const adapter = this.storageFactory.forAsset(begin.asset);
    onProgress?.({ phase: 'uploading', percent: 0 });
    await adapter.upload(begin.asset, file);
    onProgress?.({ phase: 'finalizing', percent: 100 });
    const { data, error } = await this.supabase.rpc('finalize_glimmer_upload', { p_id: begin.id });
    if (error) throw this.#error(error, { retryable: true, glimmerId: begin.id });
    return data;
  }

  async retryFinalize(glimmerId) {
    const { data, error } = await this.supabase.rpc('finalize_glimmer_upload', { p_id: glimmerId });
    if (error) throw this.#error(error);
    return data;
  }

  async listGlimmers({ spaceId, from, to, ownerId = null, limit = 50, cursor = null }) {
    const { data, error } = await this.supabase.rpc('list_glimmers', {
      p_space_id: spaceId, p_from: from, p_to: to, p_owner_id: ownerId, p_limit: limit,
      p_cursor_date: cursor?.date ?? null, p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null
    });
    if (error) throw this.#error(error);
    return (data ?? []).map((row) => row.glimmer ?? row);
  }

  async getImageUrl(asset, options) {
    return this.storageFactory.forAsset(asset).getReadableUrl(asset, options);
  }

  async deleteGlimmer(glimmer) {
    await this.storageFactory.forAsset(glimmer.asset).remove(glimmer.asset);
    const { data, error } = await this.supabase.rpc('complete_glimmer_delete', { p_id: glimmer.id });
    if (error) throw this.#error(error, { retryable: true, glimmerId: glimmer.id });
    return data;
  }

  async grantStreakRewards(spaceId) {
    const { data, error } = await this.supabase.rpc('grant_streak_rewards', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    return data;
  }

  async completeRetroGlimmer(spaceId, targetDate) {
    const { data, error } = await this.supabase.rpc('complete_retro_glimmer', {
      p_space_id: spaceId, p_target_date: targetDate
    });
    if (error) throw this.#error(error);
    return data;
  }

  #validateFile(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      throw Object.assign(new Error('Choose a JPEG, PNG, WebP, or GIF image.'), { code: 'INVALID_CONTENT_TYPE' });
    }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      throw Object.assign(new Error('Image must be 10 MiB or smaller.'), { code: 'INVALID_FILE_SIZE' });
    }
  }

  #error(error, details = {}) {
    const message = error?.message || 'Request failed.';
    const knownCode = ['REGISTRATION_LIMIT_REACHED', 'DAILY_GLIMMER_EXISTS', 'DELETE_WINDOW_EXPIRED',
      'INSUFFICIENT_REWARD_BALANCE'].find((code) => message.includes(code));
    return Object.assign(new Error(message, { cause: error }), { code: knownCode ?? 'BACKEND_ERROR', ...details });
  }
}
