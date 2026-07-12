import { StorageError, StoragePort } from './storage-port.js';

export class SupabaseStorageAdapter extends StoragePort {
  constructor(supabase) {
    super();
    this.supabase = supabase;
  }

  async upload(asset, file, options = {}) {
    const { error } = await this.supabase.storage.from(asset.bucket).upload(asset.object_key, file, {
      contentType: file.type,
      upsert: false,
      ...options.uploadOptions
    });
    if (error) throw new StorageError('UPLOAD_REJECTED', 'Unable to upload image.');
    return { ok: true };
  }

  async exists(asset) {
    const slash = asset.object_key.lastIndexOf('/');
    const folder = slash < 0 ? '' : asset.object_key.slice(0, slash);
    const filename = slash < 0 ? asset.object_key : asset.object_key.slice(slash + 1);
    const { data, error } = await this.supabase.storage.from(asset.bucket)
      .list(folder, { search: filename, limit: 10 });
    if (error) throw new StorageError('READ_FORBIDDEN', 'Unable to inspect image.');
    return data.some((item) => item.name === filename);
  }

  async getReadableUrl(asset, options = {}) {
    const expiresIn = options.expiresIn ?? 600;
    const { data, error } = await this.supabase.storage.from(asset.bucket)
      .createSignedUrl(asset.object_key, expiresIn);
    if (error || !data?.signedUrl) {
      throw new StorageError(error?.statusCode === '404' ? 'OBJECT_NOT_FOUND' : 'READ_FORBIDDEN',
        'Unable to read image.');
    }
    return { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 };
  }

  async remove(asset) {
    const { error } = await this.supabase.storage.from(asset.bucket).remove([asset.object_key]);
    if (error) throw new StorageError('DELETE_FORBIDDEN', 'Unable to delete image.');
    return { ok: true };
  }
}
