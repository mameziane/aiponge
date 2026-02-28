import { getLogger } from '../../config/service-urls';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { playlists, type Playlist, type NewPlaylist } from '../../schema/music-schema';
import type { DatabaseConnection } from '../../infrastructure/database/DatabaseConnectionFactory';
import { CONTENT_VISIBILITY, TRACK_LIFECYCLE, PLAYLIST_LIFECYCLE } from '@aiponge/shared-contracts';

const logger = getLogger('music-service-smart-playlist-engine');

export interface SmartPlaylistDefinition {
  smartKey: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  rules: SmartPlaylistRule[];
  minTracksToShow: number;
}

export interface SmartPlaylistRule {
  field: string;
  operator: 'equals' | 'contains' | 'in' | 'gte' | 'lte' | 'recent' | 'any';
  value: string | string[] | number;
  source: 'track' | 'request';
  logicalOperator?: 'AND' | 'OR';
}

export interface SmartPlaylistTrack {
  id: string;
  title: string;
  fileUrl: string;
  artworkUrl: string | null;
  duration: number;
  createdAt: string;
  mood?: string;
  playCount?: number;
}

export const SMART_PLAYLIST_DEFINITIONS: SmartPlaylistDefinition[] = [
  {
    smartKey: 'calm',
    name: 'Calm & Peaceful',
    description: 'Music for relaxation and tranquility',
    icon: '🌊',
    color: '#4A90A4',
    minTracksToShow: 1,
    rules: [
      {
        field: 'mood',
        operator: 'in',
        value: [
          'calm',
          'peaceful',
          'serene',
          'tranquil',
          'relaxed',
          'gentle',
          'soothing',
          'Peaceful',
          'Calm',
          'Calming',
          'Serene',
        ],
        source: 'request',
      },
    ],
  },
  {
    smartKey: 'energy',
    name: 'Energy & Focus',
    description: 'Boost your motivation and concentration',
    icon: '⚡',
    color: '#F5A623',
    minTracksToShow: 1,
    rules: [
      {
        field: 'mood',
        operator: 'in',
        value: [
          'focused',
          'energetic',
          'inspiring',
          'brave',
          'powerful',
          'motivated',
          'Focused',
          'Inspiring',
          'Brave',
          'Urgent',
        ],
        source: 'request',
      },
    ],
  },
  {
    smartKey: 'reflective',
    name: 'Reflective Moments',
    description: 'Music for introspection and contemplation',
    icon: '🌙',
    color: '#9B59B6',
    minTracksToShow: 1,
    rules: [
      {
        field: 'mood',
        operator: 'in',
        value: ['reflective', 'tender', 'nostalgic', 'contemplative', 'thoughtful', 'Reflective', 'Tender'],
        source: 'request',
      },
    ],
  },
  {
    smartKey: 'joyful',
    name: 'Joyful Vibes',
    description: 'Uplifting music to brighten your day',
    icon: '☀️',
    color: '#FFD700',
    minTracksToShow: 1,
    rules: [
      {
        field: 'mood',
        operator: 'in',
        value: ['joyful', 'happy', 'uplifting', 'cheerful', 'grateful', 'warm', 'Joyful', 'Warm', 'Connected'],
        source: 'request',
      },
    ],
  },
  {
    smartKey: 'passionate',
    name: 'Passionate & Bold',
    description: 'Music with emotional intensity',
    icon: '🔥',
    color: '#E74C3C',
    minTracksToShow: 1,
    rules: [
      {
        field: 'mood',
        operator: 'in',
        value: ['passionate', 'intense', 'dramatic', 'bold', 'fiery', 'Passionate', 'passionate'],
        source: 'request',
      },
    ],
  },
  {
    smartKey: 'recent',
    name: 'Recently Created',
    description: 'Your newest musical creations',
    icon: '✨',
    color: '#3498DB',
    minTracksToShow: 1,
    rules: [
      {
        field: 'created_at',
        operator: 'recent',
        value: 30, // days
        source: 'track',
      },
    ],
  },
  {
    smartKey: 'favorites',
    name: 'Most Played',
    description: 'Your top tracks by play count',
    icon: '❤️',
    color: '#E91E63',
    minTracksToShow: 3,
    rules: [
      {
        field: 'play_count',
        operator: 'gte',
        value: 3,
        source: 'track',
      },
    ],
  },
];

export class SmartPlaylistEngine {
  constructor(private db: DatabaseConnection) {}

  async getSmartPlaylistsForUser(userId: string): Promise<Array<Playlist & { computedTrackCount: number }>> {
    logger.info('Getting smart playlists for user: {}', { data0: userId });

    const smartPlaylists: Array<Playlist & { computedTrackCount: number }> = [];

    for (const definition of SMART_PLAYLIST_DEFINITIONS) {
      const tracks = await this.evaluateRulesForUser(userId, definition.rules);

      if (tracks.length >= definition.minTracksToShow) {
        const playlist = await this.getOrCreateSmartPlaylist(userId, definition);
        smartPlaylists.push({
          ...playlist,
          computedTrackCount: tracks.length,
        });
      }
    }

    return smartPlaylists;
  }

  async getSmartPlaylistTracks(userId: string, smartKey: string): Promise<SmartPlaylistTrack[]> {
    logger.info('Getting tracks for smart playlist: {} for user: {}', { data0: smartKey, data1: userId });

    const definition = SMART_PLAYLIST_DEFINITIONS.find(d => d.smartKey === smartKey);
    if (!definition) {
      logger.warn('Smart playlist definition not found: {}', { data0: smartKey });
      return [];
    }

    return this.evaluateRulesForUser(userId, definition.rules);
  }

  private async evaluateRulesForUser(userId: string, rules: SmartPlaylistRule[]): Promise<SmartPlaylistTrack[]> {
    const trackResults: SmartPlaylistTrack[] = [];

    for (const rule of rules) {
      if (rule.source === 'request') {
        const matchingTracks = await this.evaluateRequestRule(userId, rule);
        trackResults.push(...matchingTracks);
      } else if (rule.source === 'track') {
        const matchingTracks = await this.evaluateTrackRule(userId, rule);
        trackResults.push(...matchingTracks);
      }
    }

    const uniqueTracks = this.deduplicateTracks(trackResults);
    return uniqueTracks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private async evaluateRequestRule(userId: string, rule: SmartPlaylistRule): Promise<SmartPlaylistTrack[]> {
    try {
      if (rule.field === 'mood' && rule.operator === 'in') {
        const moods = Array.isArray(rule.value) ? rule.value : [rule.value];

        const result = await this.db.execute(sql`
          SELECT 
            t.id,
            t.title,
            t.file_url as "fileUrl",
            t.artwork_url as "artworkUrl",
            t.duration as "duration",
            t.created_at as "createdAt",
            t.play_count as "playCount",
            t.metadata->>'mood' as mood
          FROM mus_tracks t
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
            AND t.deleted_at IS NULL
            AND t.metadata->>'mood' = ANY(${moods})
          ORDER BY t.created_at DESC
        `);

        return result.rows as unknown as SmartPlaylistTrack[];
      }
    } catch (error) {
      logger.error('Error evaluating request rule:', { error: error instanceof Error ? error.message : String(error) });
    }

    return [];
  }

  private async evaluateTrackRule(userId: string, rule: SmartPlaylistRule): Promise<SmartPlaylistTrack[]> {
    try {
      if (rule.field === 'created_at' && rule.operator === 'recent') {
        const days = typeof rule.value === 'number' ? rule.value : 30;

        const result = await this.db.execute(sql`
          SELECT 
            t.id,
            t.title,
            t.file_url as "fileUrl",
            t.artwork_url as "artworkUrl",
            t.duration as "duration",
            t.created_at as "createdAt",
            t.play_count as "playCount"
          FROM mus_tracks t
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
            AND t.deleted_at IS NULL
            AND t.created_at >= NOW() - INTERVAL '${sql.raw(String(days))} days'
          ORDER BY t.created_at DESC
        `);

        return result.rows as unknown as SmartPlaylistTrack[];
      }

      if (rule.field === 'play_count' && rule.operator === 'gte') {
        const minPlays = typeof rule.value === 'number' ? rule.value : 3;

        const result = await this.db.execute(sql`
          SELECT 
            t.id,
            t.title,
            t.file_url as "fileUrl",
            t.artwork_url as "artworkUrl",
            t.duration as "duration",
            t.created_at as "createdAt",
            t.play_count as "playCount"
          FROM mus_tracks t
          WHERE t.user_id = ${userId}
            AND t.visibility = ${CONTENT_VISIBILITY.PERSONAL}
            AND t.status = ${TRACK_LIFECYCLE.ACTIVE}
            AND t.deleted_at IS NULL
            AND t.play_count >= ${minPlays}
          ORDER BY t.play_count DESC, t.created_at DESC
        `);

        return result.rows as unknown as SmartPlaylistTrack[];
      }
    } catch (error) {
      logger.error('Error evaluating track rule:', { error: error instanceof Error ? error.message : String(error) });
    }

    return [];
  }

  private deduplicateTracks(tracks: SmartPlaylistTrack[]): SmartPlaylistTrack[] {
    const seen = new Set<string>();
    return tracks.filter(track => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }

  private async getOrCreateSmartPlaylist(userId: string, definition: SmartPlaylistDefinition): Promise<Playlist> {
    const existing = await this.db
      .select()
      .from(playlists)
      .where(
        and(
          eq(playlists.userId, userId),
          eq(playlists.smartKey, definition.smartKey),
          eq(playlists.status, PLAYLIST_LIFECYCLE.ACTIVE),
          isNull(playlists.deletedAt)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const newPlaylist: NewPlaylist = {
      id: crypto.randomUUID(),
      name: definition.name,
      description: definition.description,
      userId,
      visibility: CONTENT_VISIBILITY.PERSONAL,
      artworkUrl: null,
      totalDuration: 0,
      playCount: 0,
      likeCount: 0,
      followerCount: 0,
      tags: [],
      category: 'algorithm',
      mood: null,
      genre: null,
      status: PLAYLIST_LIFECYCLE.ACTIVE,
      playlistType: 'smart',
      isSystem: true,
      icon: definition.icon,
      color: definition.color,
      smartKey: definition.smartKey,
      metadata: { rules: definition.rules },
    };

    const [playlist] = await this.db
      .insert(playlists)
      .values({
        ...newPlaylist,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info('Created smart playlist: {} for user: {}', { data0: definition.name, data1: userId });

    return playlist;
  }

  async cleanupEmptyDefaultPlaylists(userId: string): Promise<{ deleted: number }> {
    const defaultPlaylistNames = [
      'Calm Reset',
      'Focus Flow',
      'Energy Reboot',
      'Sleep Drift',
      'Emotional Balance',
      'Heart Coherence',
      'Gratitude Frequency',
      'Let Go Loop',
      'Safe Haven',
      'Forgive & Flow',
      'New Habit Groove',
      'Identity Upgrade',
      'From Craving to Choice',
      'Morning Intention',
      'Evening Integration',
      'Insight Mode',
      'Memory Garden',
      'Belief Rewriter',
      'Inner Dialogue',
      'Emotion Mirror',
      'Resilience Builder',
      'Flow Pulse',
      'Serotonin Sunrise',
      'Night Detox',
    ];

    const result = await this.db.execute(sql`
      DELETE FROM mus_playlists p
      WHERE p.user_id = ${userId}
        AND p.playlist_type = 'manual'
        AND p.name = ANY(${defaultPlaylistNames})
        AND NOT EXISTS (
          SELECT 1 FROM mus_playlist_tracks pt WHERE pt.playlist_id = p.id
        )
      RETURNING p.id
    `);

    const deletedCount = result.rows?.length || 0;
    logger.info('Cleaned up {} empty default playlists for user: {}', { data0: deletedCount, data1: userId });

    return { deleted: deletedCount };
  }

  async migrateUserToSmartPlaylists(userId: string): Promise<{ deleted: number; created: number }> {
    const cleanup = await this.cleanupEmptyDefaultPlaylists(userId);

    const smartPlaylists = await this.getSmartPlaylistsForUser(userId);

    return {
      deleted: cleanup.deleted,
      created: smartPlaylists.length,
    };
  }
}
