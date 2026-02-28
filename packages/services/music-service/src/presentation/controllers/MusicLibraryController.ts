import { Request, Response } from 'express';
import { z } from 'zod';
import { ContentVisibilitySchema, ContentVisibilityWithDefaultSchema } from '@aiponge/shared-contracts';
import type { IAnalyticsServiceClient } from '../../domains/music-catalog/ports/IAnalyticsServiceClient';
import { getLogger } from '../../config/service-urls';
import { createControllerHelpers, extractAuthContext, getResponseHelpers } from '@aiponge/platform-core';
const { ServiceErrors } = getResponseHelpers();

const logger = getLogger('music-library-controller');

const { handleRequest } = createControllerHelpers('music-service', (res, error, msg, req) =>
  ServiceErrors.fromException(res, error, msg, req)
);

export class MusicLibraryController {
  constructor(private readonly analyticsClient: IAnalyticsServiceClient) {}

  async createPlaylist(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to create playlist',
      successStatus: 201,
      handler: async () => {
        const createPlaylistSchema = z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
          musicIds: z.array(z.string()).optional(),
          visibility: ContentVisibilityWithDefaultSchema,
          tags: z.array(z.string()).optional(),
        });

        const validatedData = createPlaylistSchema.parse(req.body);
        const { userId } = extractAuthContext(req);

        logger.info('Creating playlist', {
          module: 'music_library_controller',
          operation: 'createPlaylist',
          playlistName: validatedData.name,
          phase: 'playlist_creation_started',
        });

        return {
          id: `playlist_${Date.now()}`,
          name: validatedData.name,
          description: validatedData.description,
          musicIds: validatedData.musicIds || [],
          visibility: validatedData.visibility,
          tags: validatedData.tags || [],
          createdBy: userId,
          createdAt: new Date().toISOString(),
        };
      },
    });
  }

  async getUserPlaylists(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to get user playlists',
      handler: async () => {
        const { userId } = extractAuthContext(req);

        logger.info('Getting playlists for user', {
          module: 'music_library_controller',
          operation: 'getUserPlaylists',
          userId,
          phase: 'user_playlists_request_started',
        });

        return {
          userId,
          playlists: [],
          total: 0,
        };
      },
    });
  }

  async updatePlaylist(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to update playlist',
      handler: async () => {
        const { id } = req.params as { id: string };
        const updatePlaylistSchema = z.object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().optional(),
          musicIds: z.array(z.string()).optional(),
          visibility: ContentVisibilitySchema.optional(),
          tags: z.array(z.string()).optional(),
        });

        const validatedData = updatePlaylistSchema.parse(req.body);

        logger.info('📚 Updating playlist: {}', { data0: id });

        return {
          id,
          ...validatedData,
          updatedAt: new Date().toISOString(),
        };
      },
    });
  }

  async deletePlaylist(req: Request, res: Response): Promise<void> {
    await handleRequest({
      req,
      res,
      errorMessage: 'Failed to delete playlist',
      handler: async () => {
        const { id } = req.params as { id: string };

        logger.info('📚 Deleting playlist: {}', { data0: id });

        return { message: 'Playlist deleted successfully' };
      },
    });
  }
}
