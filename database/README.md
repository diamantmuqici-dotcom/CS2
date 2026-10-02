# Database migrations

`schema.sql` is the baseline schema for a fresh database. Existing installations must apply files in `database/migrations/` in lexical order using the deployment migration runner. Every migration is additive, uses `IF NOT EXISTS` where possible, and does not drop player data.

The application does not run destructive schema recreation at boot. Production should record applied migration filenames in a deployment table and run migrations before starting the server.
