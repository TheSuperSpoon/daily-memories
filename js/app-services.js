import { createClient } from "./vendor/supabase.js";
import { createConfiguredSupabaseClient } from "./supabase-client.js";
import { GlimmerRepository } from "./glimmer-repository.js";
import { StorageAdapterFactory } from "./storage/storage-adapter-factory.js";
import { SupabaseStorageAdapter } from "./storage/supabase-storage-adapter.js";

export const appConfig = window.__APP_CONFIG__;
export const supabase = createConfiguredSupabaseClient(createClient, appConfig);
const storage = new SupabaseStorageAdapter(supabase);
export const repository = new GlimmerRepository({
  supabase,
  storageFactory: new StorageAdapterFactory({ supabase: storage }),
});
