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

  async clearLocalSession() {
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
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

  async consumeSessionFromUrl(url = window.location.href) {
    const hash = new URL(url).hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    const { data, error } = await this.supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw this.#error(error);
    return data.session;
  }

  onAuthStateChange(callback) {
    return this.supabase.auth.onAuthStateChange(callback).data.subscription;
  }

  async uploadGlimmer({ spaceId, date, note = '', mood = null, preferredTimezone = 'Asia/Shanghai', file, onProgress }) {
    this.#validateFile(file);
    this.#validateMood(mood);
    this.#validateTimezone(preferredTimezone);
    const { data: begin, error: beginError } = await this.supabase.rpc('begin_glimmer_upload', {
      p_space_id: spaceId, p_date: date, p_content_type: file.type,
      p_size_bytes: file.size, p_note: note, p_mood: mood, p_preferred_timezone: preferredTimezone
    });
    if (beginError) throw this.#error(beginError);
    const adapter = this.storageFactory.forAsset(begin.asset);
    onProgress?.({ phase: 'uploading', percent: 0 });
    try {
      await adapter.upload(begin.asset, file);
    } catch (uploadError) {
      const { error: cleanupError } = await this.supabase.rpc('cancel_glimmer_upload', { p_id: begin.id });
      if (cleanupError) Object.assign(uploadError, { cleanupPending: true, glimmerId: begin.id });
      throw uploadError;
    }
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

  async listGlimmers({ spaceId, from, to, role = null, limit = 50, cursor = null }) {
    const { data, error } = await this.supabase.rpc('list_glimmers_by_role', {
      p_space_id: spaceId, p_from: from, p_to: to, p_role: role, p_limit: limit,
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

  async getGiftState(spaceId) {
    const { data, error } = await this.supabase.rpc('get_gift_icons_found', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    return data ?? {};
  }

  async collectGiftIcon(spaceId, giftId) {
    this.#validateGiftId(giftId);
    const { data, error } = await this.supabase.rpc('collect_gift_icon', { p_space_id: spaceId, p_gift_id: giftId });
    if (error) throw this.#error(error);
    return data ?? {};
  }

  async getMelPreludeCompleted(spaceId) {
    const { data, error } = await this.supabase.rpc('get_mel_prelude_completed', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    return data === true;
  }

  async completeMelPrelude(spaceId) {
    const { data, error } = await this.supabase.rpc('complete_mel_prelude', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    return data === true;
  }

  async getGiftAudio(spaceId) {
    const { data, error } = await this.supabase.rpc('get_gift_audio', { p_space_id: spaceId });
    if (error) throw this.#error(error);
    if (!data?.asset) throw Object.assign(new Error('Gift audio is not available yet.'), { code: 'GIFT_AUDIO_NOT_FOUND' });
    const readable = await this.storageFactory.forAsset(data.asset).getReadableUrl(data.asset, { expiresIn: 3600 });
    return { ...data, ...readable };
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

  #validateMood(mood) {
    if (mood !== null && mood !== undefined && !['happy', 'neutral', 'sad', 'tired', 'loved'].includes(mood)) {
      throw Object.assign(new Error('Choose one of the available moods.'), { code: 'INVALID_MOOD' });
    }
  }

  #validateTimezone(timezone) {
    if (!['Asia/Shanghai', 'America/Los_Angeles'].includes(timezone)) {
      throw Object.assign(new Error('Choose Beijing or West Coast time.'), { code: 'INVALID_TIMEZONE' });
    }
  }

  #validateGiftId(giftId) {
    if (!['home', 'lighthouse', 'gallery', 'playlist', 'ticket'].includes(giftId)) {
      throw Object.assign(new Error('Unknown hidden gift.'), { code: 'INVALID_GIFT_ID' });
    }
  }

  #error(error, details = {}) {
    const message = error?.message || 'Request failed.';
    if (/jwt.*expired|session.*expired|refresh token/i.test(message)) {
      return Object.assign(new Error('Your session has expired. Sign in again.'), { code: 'SESSION_EXPIRED', ...details });
    }
    if (/failed to fetch|network|fetch failed|offline/i.test(message)) {
      return Object.assign(new Error('Network unavailable. Try again.'), { code: 'NETWORK_ERROR', ...details });
    }
    const knownCode = ['REGISTRATION_LIMIT_REACHED', 'DAILY_GLIMMER_EXISTS', 'DELETE_WINDOW_EXPIRED',
      'INSUFFICIENT_REWARD_BALANCE', 'FEATURE_FORBIDDEN', 'PROFILE_NOT_FOUND', 'INVALID_GIFT_ID',
      'GIFT_AUDIO_LOCKED', 'GIFT_AUDIO_NOT_FOUND']
      .find((code) => message.includes(code));
    return Object.assign(new Error(message), { code: knownCode ?? 'BACKEND_ERROR', ...details });
  }

  async getDashboard(spaceId, timezone = 'Asia/Shanghai') {
    this.#validateTimezone(timezone);
    const { data, error } = await this.supabase.rpc('get_glimmer_dashboard', { p_space_id: spaceId, p_timezone: timezone });
    if (error) throw this.#error(error);
    return data;
  }

  async updatePassword(password) {
    const { data, error } = await this.supabase.auth.updateUser({ password });
    if (error) throw this.#error(error);
    return data;
  }
}
