# Migration and recovery notes

- Production uses forward-only Prisma SQL migrations. Startup never resets, drops or rewrites the production database.
- Back up and verify PostgreSQL before applying a release migration. Apply migrations once from a controlled release job, then deploy compatible application code.
- If a migration fails before commit, correct it in a new reviewed migration and rerun deployment. Never edit an already-applied migration or invoke a destructive reset.
- If application behavior fails after a successful schema change, roll the application forward or temporarily restore the prior compatible application version. Preserve the migrated data.
- Restoring a database backup is an operator decision for actual data corruption, not the default response to a failed deployment.
- The test reset guard requires the database-level `slotly_test_only` marker and rejects the development database.
- The booking migration enables `btree_gist` and adds an exclusion constraint for confirmed provider intervals. Before applying it to an existing installation, verify that no overlapping confirmed bookings exist. Roll application code back without dropping the additive booking tables; schema removal requires a separately reviewed maintenance migration and a verified backup.
