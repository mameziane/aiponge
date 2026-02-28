/**
 * Streaming & Catalog Use Cases
 * Playback control, sessions, queue, and album CRUD operations
 */

// Shared repository interface (canonical definition from GetPlaybackSessionUseCase)
export type { IPlaybackSessionRepository } from './GetPlaybackSessionUseCase';

// Playback & Queue - use explicit exports to avoid duplicate IPlaybackSessionRepository
export { PlayTrackUseCase } from './PlayTrackUseCase';
export { ControlPlaybackUseCase } from './ControlPlaybackUseCase';
export { GetPlaybackSessionUseCase } from './GetPlaybackSessionUseCase';
export { AddToQueueUseCase } from './AddToQueueUseCase';
export { RemoveFromQueueUseCase } from './RemoveFromQueueUseCase';

// Track Streaming
export * from './GetTrackUseCase';
export * from './GetOptimizedStreamUrlUseCase';

// Catalog Management (Album CRUD)
export * from './CreateAlbumUseCase';
