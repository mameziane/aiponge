/**
 * Music API Live Contract Tests
 *
 * Validates that actual Music API responses match our Zod contracts.
 * These tests pass when services are unavailable (skip) or when contracts match (pass).
 * They fail ONLY when a contract violation is detected.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { ContractValidator } from './contract-validator';
import { SERVICE_URLS, createGuestUser } from './test-setup';
import {
  TracksListResponseSchema,
  TrackResponseSchema,
  AlbumsListResponseSchema,
  AlbumResponseSchema,
  AlbumWithTracksResponseSchema,
  PlaylistsListResponseSchema,
  PlaylistResponseSchema,
  PlaylistWithTracksResponseSchema,
  LyricsResponseSchema,
} from '@aiponge/shared-contracts';

function isServiceUnavailable(result: { status: string; error?: string }): boolean {
  return (
    result.status === 'fail' &&
    (result.error?.includes('ECONNREFUSED') ||
      result.error?.includes('fetch failed') ||
      result.error?.includes('network'))
  );
}

describe('Music API Live Contract Tests', () => {
  let validator: ContractValidator;
  let authHeaders: Record<string, string> = {};

  beforeAll(async () => {
    validator = new ContractValidator(SERVICE_URLS.API_GATEWAY);

    try {
      const testUser = await createGuestUser();
      if (testUser) {
        authHeaders = {
          Authorization: `Bearer ${testUser.accessToken}`,
          'x-user-id': testUser.id,
          'Content-Type': 'application/json',
        };
      }
    } catch (e) {
      console.warn('Could not create test user, tests will run without auth');
    }
  });

  afterAll(async () => {
    validator.printSummary();
  });

  describe('Tracks Endpoints', () => {
    it('GET /api/music/tracks should match TracksListResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/tracks',
        method: 'GET',
        schema: TracksListResponseSchema,
        headers: authHeaders,
        description: 'List all tracks',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/tracks/:id should match TrackResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/tracks/test-track-id',
        method: 'GET',
        schema: TrackResponseSchema,
        headers: authHeaders,
        description: 'Get single track',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/tracks/:id/lyrics should match LyricsResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/tracks/test-track-id/lyrics',
        method: 'GET',
        schema: LyricsResponseSchema,
        headers: authHeaders,
        description: 'Get track lyrics',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('Albums Endpoints', () => {
    it('GET /api/music/albums should match AlbumsListResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/albums',
        method: 'GET',
        schema: AlbumsListResponseSchema,
        headers: authHeaders,
        description: 'List all albums',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/albums/:id should match AlbumResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/albums/test-album-id',
        method: 'GET',
        schema: AlbumResponseSchema,
        headers: authHeaders,
        description: 'Get single album',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/albums/:id/tracks should match AlbumWithTracksResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/albums/test-album-id/tracks',
        method: 'GET',
        schema: AlbumWithTracksResponseSchema,
        headers: authHeaders,
        description: 'Get album with tracks',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('Playlists Endpoints', () => {
    it('GET /api/music/playlists should match PlaylistsListResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/playlists',
        method: 'GET',
        schema: PlaylistsListResponseSchema,
        headers: authHeaders,
        description: 'List all playlists',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/playlists/:id should match PlaylistResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/playlists/test-playlist-id',
        method: 'GET',
        schema: PlaylistResponseSchema,
        headers: authHeaders,
        description: 'Get single playlist',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/playlists/:id/tracks should match PlaylistWithTracksResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/playlists/test-playlist-id/tracks',
        method: 'GET',
        schema: PlaylistWithTracksResponseSchema,
        headers: authHeaders,
        description: 'Get playlist with tracks',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/playlists/smart should list smart playlists', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/playlists/smart',
        method: 'GET',
        schema: PlaylistsListResponseSchema,
        headers: authHeaders,
        description: 'List smart playlists',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('User Music Library Endpoints', () => {
    it('GET /api/music/library/tracks should match TracksListResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/library/tracks',
        method: 'GET',
        schema: TracksListResponseSchema,
        headers: authHeaders,
        description: 'List user library tracks',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });

    it('GET /api/music/library/albums should match AlbumsListResponseSchema', async () => {
      const result = await validator.validateEndpoint({
        endpoint: '/api/music/library/albums',
        method: 'GET',
        schema: AlbumsListResponseSchema,
        headers: authHeaders,
        description: 'List user library albums',
      });

      if (isServiceUnavailable(result)) return;

      if (result.validationErrors?.length) {
        console.error('Contract violations:', result.validationErrors);
      }
      expect(result.status).toBe('pass');
    });
  });

  describe('Contract Compliance Summary', () => {
    it('should report music API contract compliance', () => {
      const summary = validator.getSummary();

      console.log('\n📊 Music API Contract Compliance:');
      console.log(`   Endpoints tested: ${summary.total}`);
      console.log(`   Contracts valid:  ${summary.passed}`);
      console.log(`   Violations:       ${summary.failures.filter(f => !isServiceUnavailable(f)).length}`);
      console.log(`   Service unavailable: ${summary.failures.filter(f => isServiceUnavailable(f)).length}`);
      console.log(`   Avg response:     ${summary.avgDuration}ms`);

      const realFailures = summary.failures.filter(f => !isServiceUnavailable(f));
      if (realFailures.length > 0) {
        console.log('\n🔴 Contract Violations Detected:');
        for (const failure of realFailures) {
          console.log(`   ${failure.method} ${failure.endpoint}`);
          failure.validationErrors?.forEach(e => console.log(`     - ${e}`));
        }
      }

      expect(realFailures.length).toBe(0);
    });
  });
});
