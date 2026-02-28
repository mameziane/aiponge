import { UserServiceClient } from '../../infrastructure/clients/UserServiceClient';
import { getLogger } from '../../config/service-urls';
import { getServiceRegistry } from '../../infrastructure/ServiceFactory';
import { sql } from 'drizzle-orm';
import {
  canViewContent,
  buildContentAccessContext,
  createAuthContext,
  CONTENT_VISIBILITY,
  TIER_IDS,
  USER_ROLES,
  type TierId,
} from '@aiponge/shared-contracts';

const logger = getLogger('music-visibility-service');

const LIBRARIAN_CACHE_TTL_MS = 60_000;

interface LibrarianCache {
  ids: string[];
  fetchedAt: number;
}

let librarianCache: LibrarianCache | null = null;

export interface AccessContext {
  userId: string;
  accessibleCreatorIds: string[];
}

export class MusicVisibilityService {
  private userClient: UserServiceClient;

  constructor(userClient?: UserServiceClient) {
    this.userClient = userClient || (getServiceRegistry().userClient as UserServiceClient);
  }

  async resolveAccessibleCreatorIds(userId: string | null): Promise<AccessContext> {
    const [librarianIds, followedCreatorIds] = await Promise.all([
      this.getCachedLibrarianIds(),
      userId
        ? this.userClient
            .getAccessibleCreatorIds(userId)
            .then(result => {
              if (result.success && result.creatorIds) return result.creatorIds;
              return [] as string[];
            })
            .catch((err: unknown) => {
              logger.warn('Failed to get followed creator IDs, using librarian-only access', {
                error: err instanceof Error ? err.message : String(err),
                userId,
              });
              return [] as string[];
            })
        : Promise.resolve([] as string[]),
    ]);

    const seen = new Set<string>(librarianIds);
    const accessibleCreatorIds = [...librarianIds];
    for (const id of followedCreatorIds) {
      if (!seen.has(id)) {
        seen.add(id);
        accessibleCreatorIds.push(id);
      }
    }

    return {
      userId: userId || '',
      accessibleCreatorIds,
    };
  }

  async getLibrarianIds(): Promise<string[]> {
    return this.getCachedLibrarianIds();
  }

  checkItemAccess(params: {
    itemUserId: string;
    visibility: string;
    requestingUserId: string;
    accessibleCreatorIds: string[];
    role?: string;
    tier?: TierId;
  }): boolean {
    const { itemUserId, visibility, requestingUserId, accessibleCreatorIds, role, tier } = params;

    const auth = createAuthContext(requestingUserId, role || USER_ROLES.USER);
    const context = buildContentAccessContext(auth, accessibleCreatorIds, tier || TIER_IDS.GUEST);

    return canViewContent({ ownerId: itemUserId, visibility }, context);
  }

  private async getCachedLibrarianIds(): Promise<string[]> {
    const now = Date.now();

    if (librarianCache && now - librarianCache.fetchedAt < LIBRARIAN_CACHE_TTL_MS) {
      return librarianCache.ids;
    }

    try {
      const result = await this.userClient.getLibrarianIds();

      if (result.success && result.librarianIds) {
        librarianCache = {
          ids: result.librarianIds,
          fetchedAt: now,
        };
        return result.librarianIds;
      }

      librarianCache = null;
      return [];
    } catch (err) {
      logger.error('Failed to fetch librarian IDs', {
        error: err instanceof Error ? err.message : String(err),
      });
      librarianCache = null;
      return [];
    }
  }

  static buildPostgresArrayLiteral(ids: string[]): string {
    if (ids.length === 0) {
      return 'ARRAY[]::uuid[]';
    }
    return `ARRAY[${ids.map(id => `'${id}'`).join(',')}]::uuid[]`;
  }

  /**
   * Unified content access rules (consistent for books, albums, tracks, playlists):
   *   - Own content: user can always see their own (any visibility)
   *   - Shared content: visible if creator is in accessibleCreatorIds (librarians + followed)
   *   - Public content: visible to everyone
   */

  static buildTrackAccessCondition(userId: string, accessibleCreatorIds: string[]): ReturnType<typeof sql> {
    const arrayLiteral = MusicVisibilityService.buildPostgresArrayLiteral(accessibleCreatorIds);
    if (userId) {
      return sql`(
        (t.visibility = ${CONTENT_VISIBILITY.PERSONAL} AND t.user_id = ${userId})
        OR (t.visibility = ${CONTENT_VISIBILITY.SHARED} AND t.user_id = ANY(${sql.raw(arrayLiteral)}))
        OR t.visibility = ${CONTENT_VISIBILITY.PUBLIC}
      )`;
    }
    return sql`(
      (t.visibility = ${CONTENT_VISIBILITY.SHARED} AND t.user_id = ANY(${sql.raw(arrayLiteral)}))
      OR t.visibility = ${CONTENT_VISIBILITY.PUBLIC}
    )`;
  }

  static buildAlbumAccessCondition(
    userId: string,
    accessibleCreatorIds: string[],
    tableAlias: string = ''
  ): ReturnType<typeof sql> {
    const arrayLiteral = MusicVisibilityService.buildPostgresArrayLiteral(accessibleCreatorIds);
    const col = (name: string) => (tableAlias ? sql.raw(`${tableAlias}.${name}`) : sql.raw(name));
    if (userId) {
      return sql`(
        ${col('user_id')} = ${userId}
        OR (${col('visibility')} = ${CONTENT_VISIBILITY.SHARED} AND ${col('user_id')} = ANY(${sql.raw(arrayLiteral)}))
        OR ${col('visibility')} = ${CONTENT_VISIBILITY.PUBLIC}
      )`;
    }
    return sql`(
      (${col('visibility')} = ${CONTENT_VISIBILITY.SHARED} AND ${col('user_id')} = ANY(${sql.raw(arrayLiteral)}))
      OR ${col('visibility')} = ${CONTENT_VISIBILITY.PUBLIC}
    )`;
  }
}

let defaultInstance: MusicVisibilityService | null = null;

export function getMusicVisibilityService(): MusicVisibilityService {
  if (!defaultInstance) {
    defaultInstance = new MusicVisibilityService();
  }
  return defaultInstance;
}
