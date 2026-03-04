-- ============================================================================
-- FULL MUSIC DATA RESET
-- Deletes ALL music-related records: tracks, albums, playlists, lyrics,
-- favorites, play history, stream sessions, analytics, generation requests,
-- and associated storage file metadata.
--
-- Usage:
--   psql $DATABASE_URL -f deploy/db/reset-music-data.sql
--
-- Safe: Wrapped in a transaction — rolls back on any error.
-- ============================================================================

BEGIN;

-- ── All music tables in one TRUNCATE with CASCADE ──────────────────────────
-- PostgreSQL requires FK-linked tables to be truncated together or use CASCADE.
-- CASCADE automatically includes any tables that reference these via FK.

TRUNCATE
  mus_stream_analytics,
  mus_stream_sessions,
  mus_analytics,
  mus_recently_played,
  mus_track_feedback,
  mus_favorite_tracks,
  mus_favorite_albums,
  mus_followed_creators,
  mus_audio_jobs,
  mus_playlist_activities,
  mus_playlist_likes,
  mus_playlist_followers,
  mus_playlist_tracks,
  mus_playlists,
  mus_song_requests,
  mus_album_requests,
  mus_tracks,
  mus_albums,
  mus_lyrics
CASCADE;

-- ── Storage service file records ───────────────────────────────────────────

-- Delete file metadata for track audio and artwork files.
-- stg_processing_jobs, stg_versions, stg_access_logs cascade-delete with stg_files.
DELETE FROM stg_files WHERE category IN ('track', 'track-artwork');

-- Also catch files stored via path convention (in case category wasn't set)
DELETE FROM stg_files
WHERE category IS NULL
  AND (storage_path LIKE '%/tracks/%' OR storage_path LIKE '%/artworks/%');

-- ── Cross-service cleanup ──────────────────────────────────────────────────

-- Nullify track references in user-service reminders
UPDATE usr_reminders
SET track_id = NULL, user_track_id = NULL, track_title = NULL
WHERE track_id IS NOT NULL OR user_track_id IS NOT NULL;

-- ── Verification ───────────────────────────────────────────────────────────

DO $$
DECLARE
  track_count   INTEGER;
  album_count   INTEGER;
  lyrics_count  INTEGER;
  stg_count     INTEGER;
BEGIN
  SELECT COUNT(*) INTO track_count  FROM mus_tracks;
  SELECT COUNT(*) INTO album_count  FROM mus_albums;
  SELECT COUNT(*) INTO lyrics_count FROM mus_lyrics;
  SELECT COUNT(*) INTO stg_count    FROM stg_files WHERE category IN ('track', 'track-artwork');

  RAISE NOTICE '────────────────────────────────────────────';
  RAISE NOTICE 'Music data reset complete:';
  RAISE NOTICE '  mus_tracks:  % remaining', track_count;
  RAISE NOTICE '  mus_albums:  % remaining', album_count;
  RAISE NOTICE '  mus_lyrics:  % remaining', lyrics_count;
  RAISE NOTICE '  stg_files (track/artwork): % remaining', stg_count;
  RAISE NOTICE '────────────────────────────────────────────';

  IF track_count > 0 OR album_count > 0 THEN
    RAISE EXCEPTION 'Verification failed — tracks or albums still present!';
  END IF;
END $$;

COMMIT;
