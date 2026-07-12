# Supabase backend

Local prerequisites: Supabase CLI, Docker, Node.js, and npm. A reproducible CLI is
installed through `npm install`; use the `daily-memories-backend` Conda environment.
Production project linking, SMTP, redirect URLs, and secrets remain deployment-time
configuration. The local Before User Created hook is declared in `config.toml`.

Only the project URL and publishable key belong in browser configuration. Never put
a service-role key in this repository or frontend code.

## Commands

```sh
npm run supabase:start
npm run db:reset
npm run db:test
npm test
```

The Auth hook must also be enabled for the hosted project after migrations are
applied. Configure custom SMTP and exact production redirect URLs in the Dashboard.
