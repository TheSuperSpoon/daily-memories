export class StorageAdapterFactory {
  constructor(adapters) {
    this.adapters = new Map(Object.entries(adapters));
  }

  forAsset(asset) {
    const adapter = this.adapters.get(asset.provider);
    if (!adapter) {
      const error = new Error(`Unsupported storage provider: ${asset.provider}`);
      error.code = 'UNSUPPORTED_STORAGE_PROVIDER';
      throw error;
    }
    return adapter;
  }
}
