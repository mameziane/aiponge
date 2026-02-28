import { Router, Request, Response } from 'express';
import { isFeatureEnabled } from '@aiponge/platform-core';
import { sendSuccess, ServiceErrors } from '../../utils/response-helpers';
import { FEATURE_FLAGS, type FeatureFlagKey } from '@aiponge/shared-contracts/common';
import { BOOK_TYPE_IDS } from '@aiponge/shared-contracts/api';
import { createResponseCacheMiddleware, CACHE_PRESETS } from '../../middleware/ResponseCacheMiddleware';

const METADATA_VERSION = '1.0.0';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'fr', name: 'Français', rtl: false },
  { code: 'es', name: 'Español', rtl: false },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'de', name: 'Deutsch', rtl: false },
  { code: 'zh', name: '中文', rtl: false },
] as const;

const MUSIC_GENRES = [
  'pop',
  'rock',
  'jazz',
  'classical',
  'hip-hop',
  'r&b',
  'electronic',
  'folk',
  'country',
  'blues',
  'reggae',
  'soul',
  'ambient',
  'lo-fi',
  'world',
  'latin',
  'indie',
  'alternative',
  'meditation',
  'cinematic',
] as const;

const MUSIC_MOODS = [
  'happy',
  'sad',
  'energetic',
  'calm',
  'romantic',
  'melancholic',
  'uplifting',
  'dark',
  'peaceful',
  'motivational',
  'nostalgic',
  'dreamy',
  'aggressive',
  'hopeful',
  'reflective',
  'playful',
] as const;

const CONTENT_CATEGORIES = [
  'wellness',
  'personal-growth',
  'mindfulness',
  'creativity',
  'relationships',
  'career',
  'spirituality',
  'health',
  'education',
  'philosophy',
  'educational',
  'dreams',
  'gratitude',
  'resilience',
] as const;

const router: Router = Router();

const staticCacheMiddleware = createResponseCacheMiddleware(CACHE_PRESETS.staticMetadata);

function setMetadataHeaders(res: Response): void {
  res.set('X-Metadata-Version', METADATA_VERSION);
}

router.get('/genres', staticCacheMiddleware, (_req: Request, res: Response) => {
  if (!isFeatureEnabled(FEATURE_FLAGS.STATIC_METADATA_ENDPOINTS as FeatureFlagKey)) {
    ServiceErrors.notFound(res, 'Resource', _req);
    return;
  }
  setMetadataHeaders(res);
  sendSuccess(res, MUSIC_GENRES);
});

router.get('/moods', staticCacheMiddleware, (_req: Request, res: Response) => {
  if (!isFeatureEnabled(FEATURE_FLAGS.STATIC_METADATA_ENDPOINTS as FeatureFlagKey)) {
    ServiceErrors.notFound(res, 'Resource', _req);
    return;
  }
  setMetadataHeaders(res);
  sendSuccess(res, MUSIC_MOODS);
});

router.get('/book-types', staticCacheMiddleware, (_req: Request, res: Response) => {
  if (!isFeatureEnabled(FEATURE_FLAGS.STATIC_METADATA_ENDPOINTS as FeatureFlagKey)) {
    ServiceErrors.notFound(res, 'Resource', _req);
    return;
  }
  setMetadataHeaders(res);
  sendSuccess(res, Object.values(BOOK_TYPE_IDS));
});

router.get('/categories', staticCacheMiddleware, (_req: Request, res: Response) => {
  if (!isFeatureEnabled(FEATURE_FLAGS.STATIC_METADATA_ENDPOINTS as FeatureFlagKey)) {
    ServiceErrors.notFound(res, 'Resource', _req);
    return;
  }
  setMetadataHeaders(res);
  sendSuccess(res, CONTENT_CATEGORIES);
});

router.get('/languages', staticCacheMiddleware, (_req: Request, res: Response) => {
  if (!isFeatureEnabled(FEATURE_FLAGS.STATIC_METADATA_ENDPOINTS as FeatureFlagKey)) {
    ServiceErrors.notFound(res, 'Resource', _req);
    return;
  }
  setMetadataHeaders(res);
  sendSuccess(res, SUPPORTED_LANGUAGES);
});

router.get('/all', staticCacheMiddleware, (_req: Request, res: Response) => {
  if (!isFeatureEnabled(FEATURE_FLAGS.STATIC_METADATA_ENDPOINTS as FeatureFlagKey)) {
    ServiceErrors.notFound(res, 'Resource', _req);
    return;
  }
  setMetadataHeaders(res);
  sendSuccess(res, {
    genres: MUSIC_GENRES,
    moods: MUSIC_MOODS,
    bookTypes: Object.values(BOOK_TYPE_IDS),
    categories: CONTENT_CATEGORIES,
    targetLanguages: SUPPORTED_LANGUAGES,
  });
});

export default router;
