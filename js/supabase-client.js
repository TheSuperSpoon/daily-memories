export function createConfiguredSupabaseClient(createClient, config = window.__APP_CONFIG__) {
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
    throw new Error('Missing Supabase public configuration.');
  }
  return createClient(config.supabaseUrl, config.supabasePublishableKey);
}
