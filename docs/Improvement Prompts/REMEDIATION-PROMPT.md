# Remediation Prompt: Unpopulated Database Columns

## Context

An audit was performed across all database schemas and application code to identify columns/tables that were recommended to be populated. A coding agent implemented most of the recommendations. This document is the result of a second audit that verified the implementation and identifies **remaining gaps that must be fixed**.

---

## Completion Status Overview

| Area | Status | Detail |
|------|--------|--------|
| Phase 1: `mus_recently_played` columns | **PARTIAL** | 1 of 3 INSERT locations is complete; 2 are missing columns |
| Phase 2: `mus_playlists` metadata | **MOSTLY DONE** | Missing input validation for 4 fields + `likeCount` has no mutation endpoint |
| Phase 3: Engagement columns (favorites/follows) | **PARTIAL** | `playCount`/`lastPlayedAt` done for tracks & albums; `rating`, `notes`, `favoriteTrackIds` missing; followed creators have no engagement tracking |
| Phase 4: User profiling pipeline | **DONE** | All 5 tables have repositories, use cases, scheduled jobs. One gap: `usr_profile_metrics` is never written to |
| Phase 5: Books/entries/storage/results/tracks | **MOSTLY DONE** | Books and entries fully wired. `mus_results` counters done. 3 storage tables still unused |

---

## Issues to Remediate

### ISSUE 1 (HIGH) — `mus_recently_played` INSERT in `track-routes.ts` is incomplete

**File:** `packages/services/music-service/src/presentation/routes/library/track-routes.ts`
**Route:** `POST /api/library/track-play` (around line 995)

The current INSERT only includes `user_id`, `track_id`, `album_id`, `played_at`, `duration`, `context`, and `device_type`. The problems are:

1. **`completion_rate` is missing** — not in the INSERT column list at all, will always be the default `'0'`
2. **`device_type` is hardcoded to `'mobile'`** — should be extracted from the request body or inferred from the User-Agent header
3. **`session_id` is missing** — not in the INSERT column list at all

**Fix required:**
- Accept `completionRate`, `deviceType`, and `sessionId` from the request body (same as `streaming-routes.ts` does)
- Add these 3 columns to the raw SQL INSERT statement
- Add basic validation (completionRate should be a number 0-1, deviceType should be a string, sessionId should be a string)

**Reference implementation:** `packages/services/music-service/src/presentation/routes/streaming-routes.ts` lines 101-143 — this route does it correctly.

---

### ISSUE 2 (HIGH) — `mus_recently_played` INSERT in `LibraryOperationsService.ts` is minimal

**File:** `packages/services/music-service/src/application/services/LibraryOperationsService.ts`
**Method:** `recordTrackPlay()` (around line 356)

The current INSERT only includes `user_id`, `track_id`, `played_at`, `duration`. All 4 enrichment columns are missing:
- `completion_rate`
- `context`
- `device_type`
- `session_id`

**Fix required:**
- Extend the `recordTrackPlay()` method signature to accept optional parameters: `completionRate?: number`, `context?: object`, `deviceType?: string`, `sessionId?: string`
- Include these in the INSERT statement
- Update all callers of `recordTrackPlay()` to pass through available context

---

### ISSUE 3 (MEDIUM) — `mus_playlists` input schemas missing validation for `category`, `icon`, `color`, `playlistType`

**File:** `packages/shared/contracts/src/api/playlists.ts` (around lines 132-152)

The `CreatePlaylistRequestSchema` and `UpdatePlaylistRequestSchema` Zod schemas include `mood` and `genre` but are missing:
- `category` — should be validated (e.g., enum of `'user' | 'featured' | 'algorithm'` or a string with max length)
- `icon` — should be validated (max length 10, emoji)
- `color` — should be validated (hex color pattern, max length 20)
- `playlistType` — should be validated (enum of `'manual' | 'smart' | 'hybrid'`)

The routes currently accept these fields from `req.body` without any validation, which is a data integrity risk.

**Fix required:**
- Add these 4 fields to `CreatePlaylistRequestSchema` and `UpdatePlaylistRequestSchema`
- Apply the same validation in `packages/shared/contracts/src/api/input-schemas.ts` if a duplicate schema exists there

---

### ISSUE 4 (MEDIUM) — `mus_playlists.likeCount` has no mutation endpoint

The `likeCount` column on playlists defaults to `0` and is never incremented or decremented. There are follow/unfollow endpoints that manage `followerCount`, but no equivalent like/unlike endpoints.

**Fix required:**
- Add `POST /api/playlists/:playlistId/like` endpoint that increments `like_count`
- Add `DELETE /api/playlists/:playlistId/like` endpoint that decrements `like_count`
- Follow the same pattern as the follow/unfollow endpoints in `playlist-routes.ts` (lines 771-854)
- Consider using a junction table (`mus_playlist_likes`) to prevent duplicate likes, or use an ON CONFLICT approach

---

### ISSUE 5 (MEDIUM) — `mus_favorite_tracks.rating` and `mus_favorite_tracks.notes` have no endpoints

These columns exist in the schema but there is no API to set or update them. Tags already have a `PATCH /track/:trackId/favorite/tags` endpoint, but `rating` and `notes` do not.

**Fix required:**
- Add `PATCH /api/library/track/:trackId/favorite/rating` endpoint in `engagement-routes.ts`
  - Accept a `rating` integer (e.g., 1-5)
  - Update `mus_favorite_tracks` SET `rating` WHERE matching user/track
- Add `PATCH /api/library/track/:trackId/favorite/notes` endpoint in `engagement-routes.ts`
  - Accept a `notes` text string
  - Update `mus_favorite_tracks` SET `notes` WHERE matching user/track
- Alternatively, create a single `PATCH /api/library/track/:trackId/favorite` endpoint that accepts any combination of `rating`, `notes`, and `tags`

---

### ISSUE 6 (MEDIUM) — `mus_favorite_albums.rating` and `mus_favorite_albums.favoriteTrackIds` have no endpoints

Same as Issue 5 but for albums.

**Fix required:**
- Add `PATCH /api/library/album/:albumId/favorite` endpoint in `engagement-routes.ts`
  - Accept optional `rating` (integer 1-5) and `favoriteTrackIds` (array of UUIDs)
  - Update `mus_favorite_albums` SET the provided fields WHERE matching user/album
- `favoriteTrackIds` should be validated as an array of valid UUID strings

---

### ISSUE 7 (MEDIUM) — `mus_followed_creators` engagement columns never updated on play

When a user plays a track, the streaming route updates `playCount`/`lastPlayedAt` on `mus_favorite_tracks` and `mus_favorite_albums`, but it does NOT update these columns on `mus_followed_creators`.

**File:** `packages/services/music-service/src/presentation/routes/streaming-routes.ts`

**Fix required:**
After the existing favorite-track and favorite-album updates (around lines 184-221), add a similar block:

1. Look up the track's creator (`generated_by_user_id` or the album's owner)
2. Check if the current user follows that creator in `mus_followed_creators`
3. If so, UPDATE `mus_followed_creators` SET `play_count = play_count + 1`, `last_played_at = NOW()` WHERE matching user/creator

Also add the same `PATCH` endpoint for `rating` on followed creators (same pattern as Issues 5-6).

---

### ISSUE 8 (LOW) — `usr_profile_metrics` table is never written to

The user profiling pipeline populates `usr_profile_theme_frequencies`, `usr_profile_analytics`, `usr_user_patterns`, and `usr_user_personas` — but `usr_profile_metrics` is never written to by any repository, use case, or scheduled job.

The table tracks: `userId`, `period`, `insightCount`, `uniqueThemes`.

**Fix required:**
- In the `PatternRecognitionService` (`packages/services/user-service/src/domains/profile/services/PatternRecognitionService.ts`), at the end of `analyzeUserPatterns()` or in the `runBatchAnalysis()` method, add an upsert to `usr_profile_metrics` that records:
  - `period`: current month or week string (e.g., `'2025-W03'` or `'2025-01'`)
  - `insightCount`: count of patterns detected in this run
  - `uniqueThemes`: count of distinct themes in `usr_profile_theme_frequencies` for this user
- Add a `upsertMetrics()` method to the `PatternRepository` or `AnalysisRepository`

---

### ISSUE 9 (LOW) — `stg_access_logs` table has no write implementation

The table schema exists but zero application code writes to it.

**Fix required:**
- Create an `AccessLogRepository` in the storage service with a `logAccess()` method
- Add middleware or a utility function that logs file access events (download, stream, view) to `stg_access_logs`
- Call this from the file serving/streaming routes in the storage service
- At minimum, log: `fileId`, `userId`, `action` ('download' | 'stream' | 'view'), `accessedAt`
- Optional enrichment: `ipAddress` from request, `userAgent` from headers, `responseCode`, `bytesTransferred`, `durationMs`

---

### ISSUE 10 (LOW) — `stg_versions` table has no write implementation

File versioning logic was never built. The table is only read from in `UnreferencedFileDetectionService`.

**Fix required:**
- Create a `VersionRepository` in the storage service with `createVersion()` and `getVersions()` methods
- When a file is re-uploaded or regenerated, create a new version record in `stg_versions` instead of overwriting
- Set `versionNumber` by incrementing the max version for that `fileId`
- Store `storageProvider`, `storagePath`, `publicUrl`, `contentType`, `fileSize`, `checksum`
- This is a larger feature — implement at minimum the repository and call it from the file upload/update flow

---

### ISSUE 11 (LOW) — `stg_processing_jobs` table has no write implementation

File processing job tracking was never built for the storage service (note: the music service has a similar `mus_audio_jobs` table that IS fully implemented).

**Fix required:**
- Create a `ProcessingJobRepository` in the storage service
- When file processing is triggered (image resizing, format conversion, etc.), create a job record
- Update job status as it progresses: `pending` -> `processing` -> `completed`/`failed`
- This is a larger feature — implement the repository and integrate it where file processing occurs
- Reference the music service's `DrizzleAudioProcessingJobRepository` as a pattern

---

## Summary of Required Changes

| # | Priority | File(s) to modify | Effort |
|---|----------|-------------------|--------|
| 1 | HIGH | `track-routes.ts` | Small — add 3 columns to existing INSERT |
| 2 | HIGH | `LibraryOperationsService.ts` + callers | Small — extend method signature and INSERT |
| 3 | MEDIUM | `contracts/src/api/playlists.ts` | Small — add 4 fields to Zod schemas |
| 4 | MEDIUM | `playlist-routes.ts` | Medium — new like/unlike endpoints |
| 5 | MEDIUM | `engagement-routes.ts` | Small — new PATCH endpoints for rating/notes |
| 6 | MEDIUM | `engagement-routes.ts` | Small — new PATCH endpoint for album favorites |
| 7 | MEDIUM | `streaming-routes.ts` + `engagement-routes.ts` | Medium — creator play tracking + rating endpoint |
| 8 | LOW | `PatternRecognitionService.ts` + repository | Small — add metrics upsert at end of analysis |
| 9 | LOW | New `AccessLogRepository` + storage routes | Medium — new repository + middleware |
| 10 | LOW | New `VersionRepository` + upload flow | Large — new feature |
| 11 | LOW | New `ProcessingJobRepository` + processing flow | Large — new feature |

Start with Issues 1-2 (highest impact, lowest effort), then Issues 3-7 (medium effort, completes the engagement data model), then Issues 8-11 (lower priority infrastructure).
