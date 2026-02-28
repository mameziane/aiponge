/**
 * Library Routes - Music library endpoints for shared and private tracks
 *
 * This is the main composition file that mounts domain-specific sub-routers.
 * Individual route implementations are split into:
 * - ./library/generation-routes.ts - Track and album generation
 * - ./library/track-routes.ts - Track CRUD and operations
 * - ./library/engagement-routes.ts - Likes, follows, activity, sharing
 * - ./library/album-routes.ts - Album management
 */

import express from 'express';
import { LibraryController } from '../controllers/LibraryController';
import { GetUserLibraryUseCase } from '../../application/use-cases/library/GetUserLibraryUseCase';

import generationRoutes from './library/generation-routes';
import trackRoutes from './library/track-routes';
import engagementRoutes from './library/engagement-routes';
import albumRoutes from './library/album-routes';
import batchRoutes from './library/batch-routes';

const router = express.Router();

const getUserLibraryUseCase = new GetUserLibraryUseCase();
const libraryController = new LibraryController(getUserLibraryUseCase);

/**
 * Get music library
 * GET /api/library?source=shared|private|all&limit=50&offset=0
 *
 * Query params:
 * - source: 'shared' (default) | 'private' | 'all'
 * - limit: number (default 50, max 100)
 * - offset: number (default 0)
 * - section: 'favorites' | 'recent' | 'downloads' | 'playlists'
 */
router.get('/', libraryController.getLibrary.bind(libraryController));

router.use('/', generationRoutes);
router.use('/', batchRoutes);
router.use('/', trackRoutes);
router.use('/', engagementRoutes);
router.use('/', albumRoutes);

export default router;
