/**
 * Audio Streaming Integration Contract
 * Re-exports domain types and adds infrastructure-specific extensions.
 */

export type {
  AudioMetadata,
  OptimizedStreamUrl,
  AudioStreamingContract,
} from '../../../domains/music-catalog/contracts/AudioStreamingContract';

import type { AudioStreamingContract } from '../../../domains/music-catalog/contracts/AudioStreamingContract';

export interface AudioProcessingServiceClient extends AudioStreamingContract {
  // Client implementation for HTTP communication with audio processing service
}
