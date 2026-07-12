export class StorageAdapterFactory {
  constructor(adapters) {
    this.adapters = new Map(Object.entries(adapters));
  }

  forAsset(asset) {
    const adapter = this.adapters.get(asset.provider);
    if (!adapter) throw new Error(`Unsupported storage provider: ${asset.provider}`);
    return adapter;
  }
}
