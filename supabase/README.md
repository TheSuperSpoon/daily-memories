# Supabase backend

Local prerequisites: Supabase CLI, Docker, Node.js, and npm. They were not available
on PATH during initial repository audit. Production project linking, SMTP, redirect
URLs, and the Before User Created hook remain deployment-time configuration.

Only the project URL and publishable key belong in browser configuration. Never put
a service-role key in this repository or frontend code.
