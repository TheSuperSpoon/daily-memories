import { createClient } from "./vendor/supabase.js";
import { createConfiguredSupabaseClient } from "./supabase-client.js";
import { GlimmerRepository } from "./glimmer-repository.js?v=20260720-login-timezone";
import { StorageAdapterFactory } from "./storage/storage-adapter-factory.js";
import { SupabaseStorageAdapter } from "./storage/supabase-storage-adapter.js";
import { MemoryRepository } from "./memory-repository.js?v=20260720-glimmer-timezones";

export const appConfig = window.__APP_CONFIG__;
export const supabase = createConfiguredSupabaseClient(createClient, appConfig);
const storage = new SupabaseStorageAdapter(supabase);
const storageFactory = new StorageAdapterFactory({ supabase: storage });
export const repository = new GlimmerRepository({
  supabase,
  storageFactory,
});
export const memoryRepository = new MemoryRepository({ supabase, storageFactory });
