# Backend deployment record

## Online development project

- Project ref: `wwjltwdxhwjsoyhiuwcl`
- API origin: `https://wwjltwdxhwjsoyhiuwcl.supabase.co`
- Storage bucket: private `glimmers`, 10 MiB, JPEG/PNG/WebP/GIF
- Auth: email/password signup enabled without signup confirmation; Before User Created hook points to
  `public.before_user_created`
- Local/remote migration history matched through `202607190002` on 2026-07-19.

## Verification

- `202607130001_add_glimmer_mood.sql` deployed successfully on 2026-07-16 after a
  dry run confirmed it was the only pending migration.
- `202607190001_gift_icons_found.sql` deployed successfully on 2026-07-19 after a
  dry run confirmed it was the only pending migration. The gift RPCs require the
  authenticated member to hold the `mel` role in the requested space; Ray is
  rejected with `FEATURE_FORBIDDEN`.
- `202607190002_role_bound_gift_progress.sql` deployed successfully on 2026-07-19
  after a dry run confirmed it was the only pending migration. It migrates gift
  state to `(space_id, role)`, constrains the JSONB state to the five allowed gift
  IDs, and lets a replacement Auth account inherit the Mel role's progress.
- Cloud schema verification confirmed `glimmers.mood`, `glimmers_mood_check`, the
  six-argument `begin_glimmer_upload` signature, authenticated execute permission,
  and no anonymous execute permission.
- A cloud transaction smoke created a temporary space, began a glimmer with
  `mood='loved'`, marked it ready, and verified `list_glimmers` returned `loved`;
  the transaction was rolled back and retained no smoke data.

- `supabase db push --dry-run`: all pending migrations detected before deployment.
- `supabase db push --linked`: migrations 001-011 applied successfully.
- `supabase db lint --linked --schema public --fail-on warning`: no warnings or errors.
- `supabase db query --linked --file supabase/tests/backend_test.sql`: pgTAP reached
  `ok 19`, including 23:59:59/24:00:00 delete boundaries, and returned no failure
  diagnostics; the test transaction rolled back.
- `npm test`: 30/30 frontend, StoragePort, repository, role-gating, gift service,
  statistics, and tokenizer tests passed, including offline/session-expiry
  normalization without raw SDK error leakage.
- Real Auth concurrency smoke: three simultaneous signups produced two successful
  users and one rejection; cleanup restored zero users and two open slots.
- Random-PNG Storage smoke: two users signed in, uploaded two private images, each
  read both objects, cross-owner removal did not delete the object, and both owners
  deleted successfully. Cleanup verified zero users and zero objects.
- Concurrency smoke: two uploads ran in parallel; ten simultaneous reward grants
  produced one `+1`; ten simultaneous retro completions produced one `-1`; four
  duplicate delete completions were idempotent. Cleanup verified zero reward rows.
- Storage abuse smoke rejected a forged object path, upsert overwrite and public URL;
  a signed URL read successfully before its TTL and failed after expiration.
- Read-only smoke query: 11 migrations, two open registration slots, zero users,
  private bucket correct, seven public policies and three Storage object policies.
- Permission audit: all eight public tables have RLS, anonymous users can execute
  zero business RPCs, and authenticated users cannot mutate the reward ledger.
- Gift identity audit: remote schema lint returned no errors; the remote-safe pgTAP
  transaction reached `ok 9`, covering RPC presence, anonymous denial, Ray denial,
  Mel read/collect success, wrong-space denial, and progress inheritance after
  replacing the Mel Auth account inside a rolled-back transaction. A Chrome smoke
  verified the first-run birthday letter, all five gifts through final Gift unlock,
  Mel-only STATS, Ray-only upload ownership, narrow/desktop layouts, refresh
  persistence, and same-origin sign-out propagation. It also found and fixed the
  ticket overlay nesting and inactive secret-page display defects. The temporary
  five-gift state was reset to `{}` and both accounts were signed out afterward.

## Commands

Load `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` from an ignored local secret
store before using linked commands. Never commit or print either value.

```sh
supabase link --project-ref wwjltwdxhwjsoyhiuwcl
supabase db push --linked --dry-run
supabase db push --linked
supabase db lint --linked --schema public --level warning --fail-on warning
supabase db query --linked --file supabase/tests/backend_test.sql
npm test
```

## Remaining external smoke checks

Replace localhost Site URL and add the exact password-recovery redirect URL when the
frontend production origin is known. Password recovery uses Supabase's default email
service; its low hourly rate is accepted for this two-user application. Repeat the
browser smoke once against the eventual production origin.

No service-role or secret API key is required by the browser workflow.

## Memories multimedia rollout (2026-07-20)

- Applied `202607200001_memories_multimedia.sql` to the linked project and verified remote schema lint with no issues.
- The private `memories` bucket separates `records/` and `mel-likes/`; browsers receive only short-lived signed URLs.
- Seeded and verified the nine original Mel-likes images in their existing order and captions.
- Remote pgTAP completed 25/25 checks for membership, server-bound roles, upload lifecycle, media limits, private-object policies, popular tags, daylight-saving dates, and 24-hour owner deletion.
- The online smoke test uploads a random PNG and WAV, verifies both member reads and signed media, adds a temporary tenth Mel-like, and removes every temporary record and object.

## Launch cleanup and login timezone rollout (2026-07-20)

- Applied `202607200003_glimmer_launch_boundary.sql`, `202607200004_login_timezone_unlock.sql`, and `202607200005_glimmer_accounted_timezone.sql`; remote migration history matches local through `202607200005`.
- The login page is the only timezone selector. The chosen Beijing or US West Coast timezone is passed to `get_glimmer_dashboard` and `begin_glimmer_upload`, so `local_today` and upload unlock validation use the same clock while dates before 2026-07-20 remain rejected.
- Timeline accounting uses each glimmer's saved preferred timezone, preventing West Coast uploads from disappearing after Beijing crosses midnight.
- Final dual-account API smoke verified four mutual glimmer reads, four peer signed-image reads, two timezone dashboards, server-bound roles, moods, cross-owner delete rejection, Mel-only gift access, and automatic cleanup.
- Browser QA sequentially used the real Ray and Mel sessions to verify mutual glimmer/Gallery rendering, image and audio Memories, audio playback, historical popular-tag selection, dual-time highlighting, role labels, Mel likes, and owner-only deletion.
- Launch cleanup deleted the Mel Auth user and its personal records, reopened the Mel registration slot, removed all glimmers before 2026-07-20, removed four private assets and five orphan tags, and reassigned the nine deterministic seeded Mel-likes records to Ray so the official sequence remains intact.
- Post-cleanup inventory: one Ray member, Ray slot `claimed`, Mel slot `open`, zero glimmers, zero pre-boundary glimmers, nine Mel likes, and zero prefixed smoke records/assets. Remote schema lint returned no warnings or errors.
