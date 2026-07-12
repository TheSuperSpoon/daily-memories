# Backend deployment record

## Online development project

- Project ref: `wwjltwdxhwjsoyhiuwcl`
- API origin: `https://wwjltwdxhwjsoyhiuwcl.supabase.co`
- Storage bucket: private `glimmers`, 10 MiB, JPEG/PNG/WebP/GIF
- Auth: email signup and confirmation enabled; Before User Created hook points to
  `public.before_user_created`
- Local/remote migration history matched through `202607120011` on 2026-07-12.

## Verification

- `supabase db push --dry-run`: all pending migrations detected before deployment.
- `supabase db push --linked`: migrations 001-011 applied successfully.
- `supabase db lint --linked --schema public --fail-on warning`: no warnings or errors.
- `supabase db query --linked --file supabase/tests/backend_test.sql`: pgTAP reached
  `ok 17` and returned no failure diagnostics; the test transaction rolled back.
- `npm test`: 8/8 StoragePort and repository contract tests passed.
- Real Auth concurrency smoke: three simultaneous signups produced two successful
  users and one rejection; cleanup restored zero users and two open slots.
- Random-PNG Storage smoke: two users signed in, uploaded two private images, each
  read both objects, cross-owner removal did not delete the object, and both owners
  deleted successfully. Cleanup verified zero users and zero objects.
- Read-only smoke query: 11 migrations, two open registration slots, zero users,
  private bucket correct, seven public policies and three Storage object policies.
- Permission audit: all seven public tables have RLS, anonymous users can execute
  zero business RPCs, and authenticated users cannot mutate the reward ledger.

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

Configure custom SMTP and replace localhost Site URL and redirect URLs when the
frontend production origin is known. A final browser UI smoke belongs to frontend
integration and is intentionally outside this backend-only handoff.

No service-role or secret API key is required by the browser workflow.
