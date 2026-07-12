import { StoragePort } from './storage-port.js';

export class SupabaseStorageAdapter extends StoragePort {
  constructor(supabase) {
    super();
    this.supabase = supabase;
  }
}
