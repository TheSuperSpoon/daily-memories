import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createConfiguredSupabaseClient } from './supabase-client.js';
import { GlimmerRepository } from './glimmer-repository.js';
import { StorageAdapterFactory } from './storage/storage-adapter-factory.js';
import { SupabaseStorageAdapter } from './storage/supabase-storage-adapter.js';

const message = document.querySelector('#authMessage');

try {
  const supabase = createConfiguredSupabaseClient(createClient);
  const repository = new GlimmerRepository({
    supabase,
    storageFactory: new StorageAdapterFactory({ supabase: new SupabaseStorageAdapter(supabase) })
  });
  window.glimmerRepository = repository;
  window.dispatchEvent(new CustomEvent('glimmer-repository-ready', { detail: repository }));

  const renderSession = (session) => {
    document.querySelector('#authForm')?.classList.toggle('hidden', Boolean(session));
    document.querySelector('#sessionCard')?.classList.toggle('hidden', !session);
    document.querySelector('#sessionEmail').textContent = session?.user?.email ?? '';
    document.querySelector('#site')?.classList.toggle('backend-locked', !session);
  };
  renderSession(await repository.getSession());
  repository.onAuthStateChange((_event, session) => renderSession(session));

  document.querySelector('#authForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await repository.signIn(document.querySelector('#authEmail').value, document.querySelector('#authPassword').value);
      message.textContent = '';
    } catch (error) { message.textContent = error.message; }
  });
  document.querySelector('#signUpButton')?.addEventListener('click', async () => {
    try {
      await repository.signUp({ email: document.querySelector('#authEmail').value,
        password: document.querySelector('#authPassword').value,
        displayName: document.querySelector('#authDisplayName').value });
      message.textContent = 'Check your email to confirm the account.';
    } catch (error) { message.textContent = error.code === 'REGISTRATION_LIMIT_REACHED' ? 'Both member slots are already claimed.' : error.message; }
  });
  document.querySelector('#resetPasswordButton')?.addEventListener('click', async () => {
    try {
      await repository.resetPassword(document.querySelector('#authEmail').value, `${location.origin}${location.pathname}`);
      message.textContent = 'Password reset email sent.';
    } catch (error) { message.textContent = error.message; }
  });
  document.querySelector('#signOutButton')?.addEventListener('click', () => repository.signOut());
} catch (error) {
  message.textContent = 'Backend configuration is missing. Copy config.example.js to config.js.';
  console.error(error);
}
