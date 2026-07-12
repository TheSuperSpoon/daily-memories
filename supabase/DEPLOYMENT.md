# Backend deployment record

## Online development project

- Project ref: `wwjltwdxhwjsoyhiuwcl`
- API origin: `https://wwjltwdxhwjsoyhiuwcl.supabase.co`
- Storage bucket: private `glimmers`, 10 MiB, JPEG/PNG/WebP/GIF
- Auth: email signup and confirmation enabled; Before User Created hook points to
  `public.before_user_created`
- Local/remote migration history matched through `202607120009` on 2026-07-12.

## Verification

- `supabase db push --dry-run`: all pending migrations detected before deployment.
- `supabase db push --linked`: migrations 001-009 applied successfully.
- `supabase db lint --linked --schema public --fail-on warning`: no warnings or errors.
- `supabase db query --linked --file supabase/tests/backend_test.sql`: pgTAP reached
  `ok 17` and returned no failure diagnostics; the test transaction rolled back.
- `npm test`: 8/8 StoragePort and repository contract tests passed.
- Read-only smoke query: 9 migrations, two open registration slots, zero users,
  private bucket correct, seven public policies and three Storage object policies.

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

The repository intentionally does not contain real mailbox credentials. Before a
production handoff, use three controlled email inboxes to verify two successful
confirmations and a rejected third signup, then exercise upload/read/delete from two
authenticated browser sessions. Configure custom SMTP and replace localhost Site URL
and redirect URLs when the frontend production origin is known.

No service-role or secret API key is required by the browser workflow.
