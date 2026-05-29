# Baseline API Contracts and Migration Acceptance

This document freezes current behavior so provider migrations can be validated for parity.

## Core API Contracts

### `auth.me`
- Returns authenticated user object or `null`.
- Does not throw when unauthenticated.

### `auth.logout`
- Clears session cookie and returns `{ success: true }`.

### `brief.generate`
- Persists a brief row tied to `ctx.user.id`.
- Returns `{ briefId, generatedBrief, pinterestLinks }`.
- Must always create exactly one brief per invocation.

### `brief.uploadImage`
- Accepts base64 payload and returns `{ url }`.
- URL is app-resolvable (`/manus-storage/...` compatibility path during migration).

### `video.generate` / `video.generateAll` / `video.regenerate`
- Creates/refreshes `video_jobs`.
- Returns creation state quickly (`created`/`failed`) without waiting for completion.
- Never creates duplicate in-flight jobs for the same segment.

### `video.checkStatus`
- Polling endpoint with idempotent behavior.
- Returns cached terminal state (`completed`/`failed`) without extra provider dependency.
- In non-terminal states, may update DB status from provider response.

### `stitch.create`
- Requires completed segment jobs for the brief.
- Creates exactly one `stitch_jobs` row for each stitch attempt.
- Returns `{ stitchJobId, shotstackRenderId, status, segmentCount }` on provider acceptance.

### `stitch.checkStatus`
- Polling endpoint with idempotent behavior.
- Returns cached terminal state (`done`/`failed`) when already terminal.

## Data Ownership Invariants

- Every user-facing mutation/query must enforce `resource.userId === ctx.user.id`.
- Existing `users.id` primary keys remain stable through auth/provider migration.
- `briefs.userId`, `video_jobs.userId`, `stitch_jobs.userId` relationships remain intact.

## Migration Acceptance Gates

## Functional Parity
- Generate brief from intake data and retrieve via history.
- Generate segment videos, observe transitions to terminal states, and play output URLs.
- Stitch completed segments and retrieve final video URL.
- Login/logout/session flow works for default role and admin role.

## Reliability
- Provider failures surface actionable errors without corrupting DB rows.
- Duplicate submission protection works for segment generation and stitch creation.
- Retries do not create orphaned records.

## Data Integrity
- User isolation checks hold across all protected routes.
- Media URLs remain retrievable for expected retention period after completion.

## Cost and Performance
- Log latency and error class for each provider call.
- Track provider identifiers (`taskId`/`renderId`) for correlation.
