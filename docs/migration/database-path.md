# Database Path Decision

`DATABASE_PROVIDER` is now introduced for phased migration control.

## Executed Decision
- Runtime remains **MySQL-compatible** during provider migration (`DATABASE_PROVIDER=mysql`).
- This minimizes simultaneous risk while auth/storage/LLM providers are being replaced.

## Postgres Migration Readiness (next step)
- Port Drizzle schema from `mysql-core` to `pg-core`.
- Replace MySQL-specific upsert/insert-id patterns in `server/db.ts`.
- Run one-time data migration preserving all existing integer IDs.
- Validate all protected route ownership checks and history queries after migration.
