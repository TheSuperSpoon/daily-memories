export class GlimmerRepository {
  constructor({ supabase, storageFactory }) {
    this.supabase = supabase;
    this.storageFactory = storageFactory;
  }
}
