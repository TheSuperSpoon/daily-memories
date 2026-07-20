# For Mel birthday website

This is a static two-member birthday site backed by Supabase authentication, Postgres RPCs, and private Storage buckets.

## Main areas

- The Chinese love-letter prelude appears after authentication. Its five `.light-word` controls unlock the main site.
- `微光收集` keeps its existing daily check-in, Gallery, streak, make-up entry, reward, and plant-growth behavior.
- The sign-in screen is the single timezone selector. It shows only the live sun/moon icon and current time, remembers the last Beijing or US West Coast choice, and drives the server-calculated glimmer unlock date. Memory and glimmer uploads reuse the same preference without duplicate controls.
- `Memories` is a separate image/audio timeline. It loads by Beijing month, shows Beijing and US West Coast time, records the server-bound Ray/Mel role, and permits owner deletion for 24 hours.
- Every Memory contains exactly one image or one audio file. Text and up to ten whitespace-separated tags are optional. The five most-used tags are offered as shortcuts.
- `Mel likes` remains a long scrolling image sequence. Its nine original images and any additions load from the private `memories` bucket through short-lived signed URLs.

## Local development

Serve the repository root with a static server; do not open `index.html` as a `file://` URL.

```sh
python -m http.server 8787 --bind 127.0.0.1
```

Public Supabase browser configuration lives in `config.js`. Keep service-role keys, database passwords, and access tokens only in ignored local files or environment variables.

## Memories provisioning and verification

- Deploy `supabase/migrations/202607200001_memories_multimedia.sql`.
- Deploy `202607200002_glimmer_dual_time.sql`, `202607200003_glimmer_launch_boundary.sql`, `202607200004_login_timezone_unlock.sql`, and `202607200005_glimmer_accounted_timezone.sql` for dual-time records, the hard 2026-07-20 start boundary, login-timezone unlock behavior, and cross-midnight timeline visibility.
- Run `npm run seed:mel-likes` once; the script is idempotent and uses the source images in `assets/`.
- Run `npm test` for the browser-independent unit suite.
- Run `npm run smoke:memories` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` to verify authenticated image/audio upload, peer reads, signed URLs, tags, a temporary Mel-like, and complete cleanup.

Authentication, member roles, timestamps, private-object access, and deletion windows are enforced by Supabase rather than trusted to the browser.
