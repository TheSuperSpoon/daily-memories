export class StoragePort {
  async upload(_asset, _file, _options = {}) { throw new Error('Not implemented'); }
  async exists(_asset) { throw new Error('Not implemented'); }
  async getReadableUrl(_asset, _options = {}) { throw new Error('Not implemented'); }
  async remove(_asset) { throw new Error('Not implemented'); }
}

export class StorageError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'StorageError';
    this.code = code;
  }
}
