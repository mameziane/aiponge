import { Router } from 'express';
import { serviceAuthMiddleware, serializeError, DomainError } from '@aiponge/platform-core';
import { USER_ROLES } from '@aiponge/shared-contracts';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { getLogger } from '../../../config/service-urls';
import { getDatabase, type DatabaseConnection } from '../../../infrastructure/database/DatabaseConnectionFactory';
import { BOOK_TYPE_IDS } from '../../../infrastructure/database/schemas/library-schema';
import { sql } from 'drizzle-orm';

const logger = getLogger('user-service-routes');

async function getUploadsDir(): Promise<{
  fs: typeof import('fs/promises');
  path: typeof import('path');
  uploadsDir: string;
}> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
  const uploadsDir = path.join(workspaceRoot, 'uploads');
  return { fs, path, uploadsDir };
}

async function deleteFilesByUrl(
  fs: typeof import('fs/promises'),
  uploadsDir: string,
  path: typeof import('path'),
  rows: Array<{ url?: string | null; illustration_url?: string | null }>,
  fieldName: 'url' | 'illustration_url',
  label: string
): Promise<void> {
  for (const row of rows) {
    const value = row[fieldName];
    if (value) {
      try {
        const urlPath = value.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
        await fs.unlink(path.join(uploadsDir, urlPath));
        logger.info(`[DEV-RESET] Deleted ${label}:`, { urlPath });
      } catch (e) {
        logger.error(`[DEV-RESET] Failed to delete ${label}:`, { [fieldName]: value, error: e });
      }
    }
  }
}

function extractRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows || result || []) as T[];
}

async function resetLibraryBooks(tx: DatabaseConnection): Promise<void> {
  const { fs, path, uploadsDir } = await getUploadsDir();

  const coverUrlsResult = await tx.execute(sql`
    SELECT i.url 
    FROM lib_illustrations i
    JOIN lib_books b ON i.book_id = b.id
    WHERE b.type_id != ${BOOK_TYPE_IDS.PERSONAL} 
      AND i.illustration_type = 'cover' 
      AND i.url IS NOT NULL
  `);
  const coverUrls = extractRows<{ url: string }>(coverUrlsResult);

  await deleteFilesByUrl(fs, uploadsDir, path, coverUrls, 'url', 'book cover');

  await tx.execute(
    sql`DELETE FROM lib_illustrations WHERE book_id IN (SELECT id FROM lib_books WHERE type_id != ${BOOK_TYPE_IDS.PERSONAL})`
  );
  await tx.execute(
    sql`DELETE FROM lib_user_library WHERE book_id IN (SELECT id FROM lib_books WHERE type_id != ${BOOK_TYPE_IDS.PERSONAL})`
  );
  await tx.execute(
    sql`DELETE FROM lib_illustrations WHERE entry_id IN (SELECT id FROM lib_entries WHERE book_id IN (SELECT id FROM lib_books WHERE type_id != ${BOOK_TYPE_IDS.PERSONAL}))`
  );
  await tx.execute(
    sql`DELETE FROM lib_entries WHERE book_id IN (SELECT id FROM lib_books WHERE type_id != ${BOOK_TYPE_IDS.PERSONAL})`
  );
  await tx.execute(
    sql`DELETE FROM lib_chapters WHERE book_id IN (SELECT id FROM lib_books WHERE type_id != ${BOOK_TYPE_IDS.PERSONAL})`
  );
  await tx.execute(sql`DELETE FROM lib_books WHERE type_id != ${BOOK_TYPE_IDS.PERSONAL}`);
}

async function resetMusicLibrary(tx: DatabaseConnection): Promise<void> {
  const { fs, path, uploadsDir } = await getUploadsDir();

  const musicFilesResult = await tx.execute(sql`
    SELECT storage_path FROM stg_files 
    WHERE storage_path LIKE 'user/%/tracks/%'
       OR storage_path LIKE 'user/%/artworks/%'
       OR storage_path LIKE 'user/%/covers/%'
  `);
  const musicFilePaths = extractRows<{ storage_path: string }>(musicFilesResult)
    .map(r => r.storage_path)
    .filter(Boolean);

  const trackFileResult = await tx.execute(sql`
    SELECT file_url FROM mus_tracks WHERE file_url IS NOT NULL AND file_url LIKE '/uploads/%'
  `);
  const trackFilePaths = extractRows<{ file_url: string }>(trackFileResult)
    .map(r => r.file_url?.replace('/uploads/', ''))
    .filter(Boolean);

  const allFilePaths = [...new Set([...musicFilePaths, ...trackFilePaths])];
  logger.info(`[DEV-RESET] Found ${allFilePaths.length} music files to delete`);

  let fileDeleteFailures = 0;
  for (const filePath of allFilePaths) {
    try {
      const fullPath = path.join(uploadsDir, filePath);
      await fs.unlink(fullPath);
    } catch (e) {
      fileDeleteFailures++;
    }
  }
  if (fileDeleteFailures > 0) {
    logger.warn(`File cleanup: ${fileDeleteFailures}/${allFilePaths.length} files could not be deleted`, {
      failures: fileDeleteFailures,
      total: allFilePaths.length,
    });
  }

  await tx.execute(sql`DELETE FROM mus_playlist_tracks`);
  await tx.execute(sql`DELETE FROM mus_playlist_activities`);
  await tx.execute(sql`DELETE FROM mus_playlist_followers`);
  await tx.execute(sql`DELETE FROM mus_playlist_likes`);
  await tx.execute(sql`DELETE FROM mus_playlists`);
  await tx.execute(sql`DELETE FROM mus_favorite_tracks`);
  await tx.execute(sql`DELETE FROM mus_favorite_albums`);
  await tx.execute(sql`DELETE FROM mus_followed_creators`);
  await tx.execute(sql`DELETE FROM mus_recently_played`);
  await tx.execute(sql`DELETE FROM mus_stream_analytics`);
  await tx.execute(sql`DELETE FROM mus_stream_sessions`);
  await tx.execute(sql`DELETE FROM mus_track_feedback`);
  await tx.execute(sql`DELETE FROM mus_lyrics`);
  await tx.execute(sql`DELETE FROM mus_audio_jobs`);
  await tx.execute(sql`DELETE FROM mus_song_requests`);
  await tx.execute(sql`DELETE FROM mus_album_requests`);
  await tx.execute(sql`DELETE FROM mus_analytics`);
  await tx.execute(sql`DELETE FROM mus_tracks`);
  await tx.execute(sql`DELETE FROM mus_albums`);
  await tx.execute(
    sql`DELETE FROM stg_files WHERE storage_path LIKE 'user/%/tracks/%' OR storage_path LIKE 'user/%/artworks/%' OR storage_path LIKE 'user/%/covers/%'`
  );

  try {
    const userDir = path.join(uploadsDir, 'user');
    const userFolders = await fs.readdir(userDir).catch(() => []);
    for (const userId of userFolders) {
      const userTracksDir = path.join(userDir, userId, 'tracks');
      const userArtworksDir = path.join(userDir, userId, 'artworks');
      const userCoversDir = path.join(userDir, userId, 'covers');
      try {
        await fs.rm(userTracksDir, { recursive: true, force: true });
      } catch {
        /* folder might not exist */
      }
      try {
        await fs.rm(userArtworksDir, { recursive: true, force: true });
      } catch {
        /* folder might not exist */
      }
      try {
        await fs.rm(userCoversDir, { recursive: true, force: true });
      } catch {
        /* folder might not exist */
      }
    }
    logger.info('[DEV-RESET] Cleaned user track folders');
  } catch (e) {
    logger.error('[DEV-RESET] Failed to clean user track folders:', { error: e });
  }
}

async function deleteNonSystemIllustrations(
  tx: DatabaseConnection,
  fs: typeof import('fs/promises'),
  path: typeof import('path'),
  uploadsDir: string
): Promise<void> {
  const entryIllustrationsResult = await tx.execute(sql`
    SELECT illustration_url FROM lib_entries 
    WHERE illustration_url IS NOT NULL 
    AND book_id IN (SELECT id FROM lib_books WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false))
  `);
  const entryIllustrations = extractRows<{ illustration_url: string }>(entryIllustrationsResult);

  await deleteFilesByUrl(fs, uploadsDir, path, entryIllustrations, 'illustration_url', 'entry illustration');

  const illustrationsResult = await tx.execute(sql`
    SELECT url FROM lib_illustrations 
    WHERE entry_id IN (SELECT id FROM lib_entries WHERE book_id IN (SELECT id FROM lib_books WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)))
  `);
  const illustrations = extractRows<{ url: string }>(illustrationsResult);

  await deleteFilesByUrl(fs, uploadsDir, path, illustrations, 'url', 'illustration');
}

async function resetPersonalBooks(tx: DatabaseConnection): Promise<void> {
  const { fs, path, uploadsDir } = await getUploadsDir();

  await deleteNonSystemIllustrations(tx, fs, path, uploadsDir);

  await tx.execute(
    sql`DELETE FROM lib_illustrations WHERE entry_id IN (SELECT id FROM lib_entries WHERE book_id IN (SELECT id FROM lib_books WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)))`
  );
  await tx.execute(
    sql`DELETE FROM lib_entries WHERE book_id IN (SELECT id FROM lib_books WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false))`
  );
  await tx.execute(
    sql`DELETE FROM lib_chapters WHERE book_id IN (SELECT id FROM lib_books WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false))`
  );
  await tx.execute(
    sql`DELETE FROM lib_books WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)`
  );
  await tx.execute(
    sql`DELETE FROM usr_insights WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)`
  );
  await tx.execute(
    sql`DELETE FROM usr_reflections WHERE user_id IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)`
  );
}

async function resetUploads(tx: DatabaseConnection): Promise<void> {
  const { fs, path, uploadsDir } = await getUploadsDir();
  const userDir = path.join(uploadsDir, 'user');

  await tx.execute(sql`DELETE FROM stg_files WHERE storage_path LIKE 'user/%'`);

  try {
    await fs.rm(userDir, { recursive: true, force: true });
    await fs.mkdir(userDir, { recursive: true });
    logger.info('[DEV-RESET] Cleaned user uploads folder:', { userDir });
  } catch (e) {
    logger.error('[DEV-RESET] Failed to delete user folder:', { error: e });
  }
}

async function resetNonSystemUsers(tx: DatabaseConnection): Promise<void> {
  const { fs, path, uploadsDir } = await getUploadsDir();

  await deleteNonSystemIllustrations(tx, fs, path, uploadsDir);

  const NON_SYSTEM = sql`(SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)`;
  const NON_SYSTEM_BOOKS = sql`(SELECT id FROM lib_books WHERE user_id IN ${NON_SYSTEM})`;
  const NON_SYSTEM_ENTRIES = sql`(SELECT id FROM lib_entries WHERE book_id IN ${NON_SYSTEM_BOOKS})`;

  await tx.execute(sql`DELETE FROM usr_reflections WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_insights WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM lib_user_library WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM lib_illustrations WHERE entry_id IN ${NON_SYSTEM_ENTRIES}`);
  await tx.execute(sql`DELETE FROM lib_illustrations WHERE book_id IN ${NON_SYSTEM_BOOKS}`);
  await tx.execute(sql`DELETE FROM lib_entries WHERE book_id IN ${NON_SYSTEM_BOOKS}`);
  await tx.execute(sql`DELETE FROM lib_chapters WHERE book_id IN ${NON_SYSTEM_BOOKS}`);
  await tx.execute(sql`DELETE FROM lib_books WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM lib_book_generation_requests WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_user_patterns WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_user_personas WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_profile_analytics WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_profile_theme_frequencies WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_profile_metrics WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_profiles WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_reminders WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_expo_push_tokens WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_consent_records WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_import_backups WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_risk_flags WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_data_requests WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_share_links WHERE created_by IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_subscription_events WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_usage_limits WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_subscriptions WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_guest_conversion_state WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_guest_data_migrations WHERE new_user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_credit_gifts WHERE sender_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_credit_transactions WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_credit_orders WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_user_credits WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_user_sessions WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_password_reset_tokens WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_sms_verification_codes WHERE user_id IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_token_blacklist WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_audit_logs WHERE user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_organizations WHERE owner_user_id IN ${NON_SYSTEM}`);

  await tx.execute(sql`DELETE FROM usr_creator_members WHERE member_id::uuid IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_creator_members WHERE creator_id::uuid IN ${NON_SYSTEM}`);
  await tx.execute(sql`DELETE FROM usr_invitations WHERE creator_id::uuid IN ${NON_SYSTEM}`);

  const userIdsResult = await tx.execute(
    sql`SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false`
  );
  const userIds = extractRows<{ id: string }>(userIdsResult);

  const userFilesToDeleteResult = await tx.execute(
    sql`SELECT storage_path FROM stg_files WHERE user_id::uuid IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)`
  );
  const userFilesToDelete = extractRows<{ storage_path: string }>(userFilesToDeleteResult);

  for (const row of userFilesToDelete) {
    if (row.storage_path) {
      try {
        await fs.unlink(path.join(uploadsDir, row.storage_path));
      } catch (e) {
        logger.error('[DEV-RESET] Failed to delete file:', { storagePath: row.storage_path, error: e });
      }
    }
  }

  await tx.execute(
    sql`DELETE FROM stg_files WHERE user_id::uuid IN (SELECT id FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false)`
  );
  await tx.execute(
    sql`DELETE FROM usr_accounts WHERE role NOT IN (${USER_ROLES.ADMIN}, ${USER_ROLES.LIBRARIAN}) AND is_system_account = false`
  );

  const userUploadsDir = path.join(uploadsDir, 'user');
  for (const user of userIds) {
    const userFolder = path.join(userUploadsDir, user.id);
    try {
      await fs.rm(userFolder, { recursive: true, force: true });
      logger.info('[DEV-RESET] Deleted user folder:', { userId: user.id });
    } catch (e) {
      // Folder might not exist
    }
  }

  const anonymousFolder = path.join(userUploadsDir, 'anonymous');
  try {
    await fs.rm(anonymousFolder, { recursive: true, force: true });
    logger.info('[DEV-RESET] Deleted anonymous uploads folder');
  } catch (e) {
    // Folder might not exist
  }
}

async function resetAiAnalytics(tx: DatabaseConnection): Promise<void> {
  await tx.execute(sql`DELETE FROM aia_trace_spans`);
  await tx.execute(sql`DELETE FROM aia_request_traces`);
  await tx.execute(sql`DELETE FROM aia_provider_usage_logs`);
  await tx.execute(sql`DELETE FROM aia_system_metrics`);
  await tx.execute(sql`DELETE FROM aia_user_activity_logs`);
}

async function resetBookGenerationRequests(tx: DatabaseConnection): Promise<void> {
  await tx.execute(sql`DELETE FROM lib_book_generation_requests`);
}

async function resetUserSessions(tx: DatabaseConnection): Promise<void> {
  await tx.execute(sql`DELETE FROM usr_user_sessions`);
}

export function registerAdminDevRoutes(router: Router): void {
  router.post('/admin/dev-reset', serviceAuthMiddleware({ required: false }), async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      ServiceErrors.forbidden(res, 'Not available in production', req);
      return;
    }

    const { category } = req.body;
    if (!category) {
      ServiceErrors.badRequest(res, 'Category is required', req);
      return;
    }

    const db = getDatabase();

    try {
      await db.transaction(async tx => {
        switch (category) {
          case 'libraryBooks':
            await resetLibraryBooks(tx);
            break;
          case 'musicLibrary':
            await resetMusicLibrary(tx);
            break;
          case 'music':
            throw new DomainError('Use musicLibrary category instead', 400);
          case 'personalBooks':
          case 'books':
            await resetPersonalBooks(tx);
            break;
          case 'uploads':
            await resetUploads(tx);
            break;
          case 'nonSystemUsers':
            await resetNonSystemUsers(tx);
            break;
          case 'aiAnalytics':
            await resetAiAnalytics(tx);
            break;
          case 'bookGenerationRequests':
            await resetBookGenerationRequests(tx);
            break;
          case 'userSessions':
            await resetUserSessions(tx);
            break;
          default:
            throw new DomainError(`Unknown category: ${category}`, 400);
        }
      });

      const categoryMessages: Record<string, string> = {
        libraryBooks: 'Deleted all non-personal library books, chapters, entries, and user library saves',
        musicLibrary: 'Deleted all music library data: albums, tracks, playlists, favorites',
        books: 'Deleted books, entries, insights, reflections for non-system users',
        uploads: 'Deleted all user uploaded files (avatars, images, etc.)',
        nonSystemUsers: 'Deleted non-system users and all associated data including files',
        aiAnalytics: 'Deleted all AI analytics data: traces, spans, provider usage, metrics, activity logs',
        bookGenerationRequests: 'Deleted all book generation requests',
        userSessions: 'Deleted all user sessions',
      };
      sendSuccess(res, { message: categoryMessages[category] || `Deleted ${category}` });
    } catch (error) {
      logger.error('[DEV-RESET] Error:', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Dev reset failed', req);
      return;
    }
  });
}
