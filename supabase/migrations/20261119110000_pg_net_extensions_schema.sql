-- Security advisor 0014: pg_net was registered in the public schema.
-- Its functions live in schema "net" either way; only the extension's home
-- changes. The HTTP response log (net._http_response) starts empty again.
-- Rollback: drop extension pg_net; create extension pg_net;  (back into public)
drop extension if exists pg_net;
create extension pg_net with schema extensions;
