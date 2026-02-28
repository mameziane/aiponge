/**
 * Unified Playback Session Entity - Complete audio streaming and playback management
 * Consolidates streaming capabilities with advanced player controls
 */

import { MusicError } from '../../../application/errors';

export enum PlaybackMode {
  NORMAL = 'normal',
  SHUFFLE = 'shuffle',
}

export enum RepeatMode {
  NONE = 'none', // No repeat'
  ALL = 'all', // Repeat entire playlist/queue'
  ONE = 'one', // Repeat current track'
}

export enum PlaybackState {
  IDLE = 'idle',
  LOADING = 'loading',
  BUFFERING = 'buffering',
  PLAYING = 'playing',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ENDED = 'ended',
  ERROR = 'error',
}

export enum StreamQuality {
  LOSSLESS = 'lossless', // 1411kbps+'
  HIGH = 'high', // 320kbps'
  MEDIUM = 'medium', // 192kbps'
  LOW = 'low', // 128kbps'
}

export enum StreamType {
  LIVE = 'live',
  ON_DEMAND = 'on_demand',
  OFFLINE = 'offline',
}

export interface StreamMetrics {
  bufferHealth: number; // Percentage 0-100
  bandwidth: number; // kbps
  bitrate: number; // Current streaming bitrate
  droppedFrames: number;
  rebufferingEvents: number;
  totalPlayTime: number; // seconds
  lastHeartbeat: Date;
}

export interface QueueItem {
  trackId: string;
  position: number; // Position in original queue
  shufflePosition?: number; // Position in shuffled queue
  metadata?: {
    title: string;
    displayName: string;
    duration: number;
  };
}

export interface PlaybackQueue {
  items: QueueItem[];
  currentIndex: number;
  originalOrder: QueueItem[]; // Preserved for shuffle/unshuffle
}

export interface PlaybackSessionEntityProps {
  id: string;
  userId: string;
  deviceId: string;

  // Current track state
  currentTrackId: string;
  position: number; // Current position in seconds
  duration: number; // Track duration
  volume: number; // 0-100

  // Playback state
  state: PlaybackState;
  mode: PlaybackMode;
  repeat: RepeatMode;

  // Queue management
  queue: PlaybackQueue;

  // Streaming details (consolidated from StreamSession)
  quality: StreamQuality;
  type: StreamType;
  streamUrl?: string;
  cdnUrl?: string;
  availableQualities: StreamQuality[];

  // Performance metrics
  metrics: StreamMetrics;

  // Timestamps
  startedAt?: Date;
  endedAt?: Date;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class PlaybackSessionEntity {
  constructor(private props: PlaybackSessionEntityProps) {
    this.validateSession();
  }

  static create(
    props: Omit<
      PlaybackSessionEntityProps,
      'id' | 'state' | 'position' | 'queue' | 'metrics' | 'lastActivity' | 'createdAt' | 'updatedAt'
    >
  ): PlaybackSessionEntity {
    return new PlaybackSessionEntity({
      ...props,
      id: crypto.randomUUID(),
      state: PlaybackState.IDLE,
      position: 0,
      queue: {
        items: [],
        currentIndex: -1,
        originalOrder: [],
      },
      metrics: {
        bufferHealth: 0,
        bandwidth: 0,
        bitrate: 0,
        droppedFrames: 0,
        rebufferingEvents: 0,
        totalPlayTime: 0,
        lastHeartbeat: new Date(),
      },
      lastActivity: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Getters
  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get deviceId(): string {
    return this.props.deviceId;
  }
  get currentTrackId(): string {
    return this.props.currentTrackId;
  }
  get position(): number {
    return this.props.position;
  }
  get duration(): number {
    return this.props.duration;
  }
  get volume(): number {
    return this.props.volume;
  }
  get state(): PlaybackState {
    return this.props.state;
  }
  get mode(): PlaybackMode {
    return this.props.mode;
  }
  get repeat(): RepeatMode {
    return this.props.repeat;
  }
  get queue(): PlaybackQueue {
    return { ...this.props.queue };
  }
  get quality(): StreamQuality {
    return this.props.quality;
  }
  get type(): StreamType {
    return this.props.type;
  }
  get streamUrl(): string | undefined {
    return this.props.streamUrl;
  }
  get cdnUrl(): string | undefined {
    return this.props.cdnUrl;
  }
  get availableQualities(): StreamQuality[] {
    return [...this.props.availableQualities];
  }
  get metrics(): StreamMetrics {
    return { ...this.props.metrics };
  }
  get startedAt(): Date | undefined {
    return this.props.startedAt;
  }
  get endedAt(): Date | undefined {
    return this.props.endedAt;
  }

  // === STREAMING SESSION CONTROLS ===

  startBuffering(): void {
    this.props.state = PlaybackState.BUFFERING;
    this.updateActivity();
  }

  // === BASIC PLAYBACK CONTROLS ===

  play(trackId?: string, streamUrl?: string, cdnUrl?: string): void {
    if (trackId && trackId !== this.props.currentTrackId) {
      this.loadTrack(trackId, streamUrl, cdnUrl);
    }

    this.props.state = PlaybackState.PLAYING;
    if (!this.props.startedAt) {
      this.props.startedAt = new Date();
    }
    this.updateActivity();
  }

  pause(): void {
    if (this.props.state === PlaybackState.PLAYING) {
      this.props.state = PlaybackState.PAUSED;
      this.updateActivity();
    }
  }

  resume(): void {
    if (this.props.state === PlaybackState.PAUSED) {
      this.props.state = PlaybackState.PLAYING;
      this.updateActivity();
    }
  }

  stop(): void {
    this.props.state = PlaybackState.STOPPED;
    this.props.position = 0;
    this.props.endedAt = new Date();
    this.updateActivity();
  }

  error(errorMessage?: string): void {
    this.props.state = PlaybackState.ERROR;
    this.updateActivity();
  }

  seek(position: number): void {
    this.props.position = Math.max(0, Math.min(this.props.duration, position));
    this.updateActivity();
  }

  setVolume(volume: number): void {
    this.props.volume = Math.max(0, Math.min(100, volume));
    this.updateActivity();
  }

  // === STREAMING QUALITY CONTROLS ===

  adaptQuality(quality: StreamQuality, newStreamUrl?: string, newCdnUrl?: string): void {
    this.props.quality = quality;
    if (newStreamUrl) this.props.streamUrl = newStreamUrl;
    if (newCdnUrl) this.props.cdnUrl = newCdnUrl;
    this.updateActivity();
  }

  setAvailableQualities(qualities: StreamQuality[]): void {
    this.props.availableQualities = [...qualities];
    this.updateActivity();
  }

  // === METRICS & MONITORING ===

  updateMetrics(metrics: Partial<StreamMetrics>): void {
    this.props.metrics = {
      ...this.props.metrics,
      ...metrics,
      lastHeartbeat: new Date(),
    };
    this.updateActivity();
  }

  incrementRebuffering(): void {
    this.props.metrics.rebufferingEvents++;
    this.props.metrics.lastHeartbeat = new Date();
    this.updateActivity();
  }

  addPlayTime(seconds: number): void {
    this.props.metrics.totalPlayTime += seconds;
    this.props.metrics.lastHeartbeat = new Date();
    this.updateActivity();
  }

  updateHeartbeat(): void {
    this.props.metrics.lastHeartbeat = new Date();
    this.updateActivity();
  }

  // === PLAYLIST MODE CONTROLS ===

  setPlaybackMode(mode: PlaybackMode): void {
    if (this.props.mode === mode) return;

    this.props.mode = mode;

    if (mode === PlaybackMode.SHUFFLE) {
      this.shuffleQueue();
    } else {
      this.unshuffleQueue();
    }

    this.updateActivity();
  }

  setRepeatMode(repeat: RepeatMode): void {
    this.props.repeat = repeat;
    this.updateActivity();
  }

  // === QUEUE MANAGEMENT ===

  loadQueue(trackIds: string[], startIndex: number = 0): void {
    const items: QueueItem[] = trackIds.map((trackId, index) => ({
      trackId,
      position: index,
    }));

    this.props.queue = {
      items: [...items],
      currentIndex: startIndex,
      originalOrder: [...items],
    };

    // Load the first track
    if (items.length > 0 && startIndex < items.length) {
      this.props.currentTrackId = items[startIndex].trackId;
    }

    // Apply current mode
    if (this.props.mode === PlaybackMode.SHUFFLE) {
      this.shuffleQueue();
    }

    this.updateActivity();
  }

  addToQueue(trackId: string): void {
    const newItem: QueueItem = {
      trackId,
      position: this.props.queue.items.length,
    };

    this.props.queue.items.push(newItem);
    this.props.queue.originalOrder.push(newItem);

    // If shuffle mode, add to shuffled position
    if (this.props.mode === PlaybackMode.SHUFFLE) {
      const randomIndex = Math.floor(Math.random() * this.props.queue.items.length);
      newItem.shufflePosition = randomIndex;
    }

    this.updateActivity();
  }

  removeFromQueue(trackId: string): void {
    const originalIndex = this.props.queue.items.findIndex(item => item.trackId === trackId);
    if (originalIndex === -1) return;

    // Adjust current index if necessary
    if (originalIndex < this.props.queue.currentIndex) {
      this.props.queue.currentIndex--;
    } else if (originalIndex === this.props.queue.currentIndex) {
      // Removed current track - decide what to do
      if (this.props.queue.items.length > 1) {
        // Keep same index (will point to next track)
        if (this.props.queue.currentIndex >= this.props.queue.items.length - 1) {
          this.props.queue.currentIndex = 0; // Wrap to beginning
        }
      } else {
        this.props.queue.currentIndex = -1; // Empty queue
      }
    }

    // Remove from both arrays
    this.props.queue.items.splice(originalIndex, 1);
    const originalOrderIndex = this.props.queue.originalOrder.findIndex(item => item.trackId === trackId);
    if (originalOrderIndex !== -1) {
      this.props.queue.originalOrder.splice(originalOrderIndex, 1);
    }

    this.updateActivity();
  }

  // === NAVIGATION CONTROLS ===

  next(): string | null {
    if (this.props.queue.items.length === 0) return null;

    if (this.props.repeat === RepeatMode.ONE) {
      // Stay on current track
      this.seek(0);
      return this.props.currentTrackId;
    }

    let nextIndex = this.props.queue.currentIndex + 1;

    if (nextIndex >= this.props.queue.items.length) {
      if (this.props.repeat === RepeatMode.ALL) {
        nextIndex = 0; // Loop back to start
      } else {
        // End of queue, no repeat
        this.props.state = PlaybackState.ENDED;
        return null;
      }
    }

    this.props.queue.currentIndex = nextIndex;
    this.props.currentTrackId = this.props.queue.items[nextIndex].trackId;
    this.props.position = 0;
    this.updateActivity();

    return this.props.currentTrackId;
  }

  previous(): string | null {
    if (this.props.queue.items.length === 0) return null;

    // If we're more than 3 seconds into the track, restart current track'
    if (this.props.position > 3) {
      this.seek(0);
      return this.props.currentTrackId;
    }

    let prevIndex = this.props.queue.currentIndex - 1;

    if (prevIndex < 0) {
      if (this.props.repeat === RepeatMode.ALL) {
        prevIndex = this.props.queue.items.length - 1; // Loop to end
      } else {
        // Beginning of queue, restart current track
        this.seek(0);
        return this.props.currentTrackId;
      }
    }

    this.props.queue.currentIndex = prevIndex;
    this.props.currentTrackId = this.props.queue.items[prevIndex].trackId;
    this.props.position = 0;
    this.updateActivity();

    return this.props.currentTrackId;
  }

  // === SHUFFLE FUNCTIONALITY ===

  private shuffleQueue(): void {
    if (this.props.queue.items.length <= 1) return;

    // Create shuffled indices
    const indices = Array.from({ length: this.props.queue.items.length }, (_, i) => i);

    // Keep current track at current position if playing
    if (this.props.queue.currentIndex >= 0) {
      // Fisher-Yates shuffle for other positions
      for (let i = indices.length - 1; i > 0; i--) {
        if (i === this.props.queue.currentIndex) continue; // Skip current track
        const j = Math.floor(Math.random() * i);
        if (j === this.props.queue.currentIndex) continue; // Skip current track
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    } else {
      // Normal Fisher-Yates shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }

    // Apply shuffle positions
    this.props.queue.items.forEach((item, index) => {
      item.shufflePosition = indices[index];
    });

    // Sort by shuffle position
    this.props.queue.items.sort((a, b) => (a.shufflePosition || 0) - (b.shufflePosition || 0));

    // Update current index to maintain current track
    if (this.props.queue.currentIndex >= 0) {
      const currentTrackId = this.props.currentTrackId;
      this.props.queue.currentIndex = this.props.queue.items.findIndex(item => item.trackId === currentTrackId);
    }
  }

  private unshuffleQueue(): void {
    // Restore original order
    this.props.queue.items = [...this.props.queue.originalOrder];

    // Update current index to maintain current track
    if (this.props.currentTrackId) {
      this.props.queue.currentIndex = this.props.queue.items.findIndex(
        item => item.trackId === this.props.currentTrackId
      );
    }

    // Clear shuffle positions
    this.props.queue.items.forEach(item => {
      delete item.shufflePosition;
    });
  }

  // === UTILITY METHODS ===

  getCurrentTrack(): QueueItem | null {
    if (this.props.queue.currentIndex >= 0 && this.props.queue.currentIndex < this.props.queue.items.length) {
      return this.props.queue.items[this.props.queue.currentIndex];
    }
    return null;
  }

  hasNext(): boolean {
    if (this.props.repeat === RepeatMode.ONE || this.props.repeat === RepeatMode.ALL) {
      return true;
    }
    return this.props.queue.currentIndex < this.props.queue.items.length - 1;
  }

  hasPrevious(): boolean {
    if (this.props.repeat === RepeatMode.ALL) {
      return true;
    }
    return this.props.queue.currentIndex > 0 || this.props.position > 3;
  }

  getQueueLength(): number {
    return this.props.queue.items.length;
  }

  isShuffled(): boolean {
    return this.props.mode === PlaybackMode.SHUFFLE;
  }

  getProgress(): number {
    if (this.props.duration === 0) return 0;
    return Math.min(100, (this.props.position / this.props.duration) * 100);
  }

  isPlaying(): boolean {
    return this.props.state === PlaybackState.PLAYING;
  }

  isActive(): boolean {
    return [PlaybackState.BUFFERING, PlaybackState.PLAYING, PlaybackState.PAUSED].includes(this.props.state);
  }

  isStale(timeoutSeconds: number = 30): boolean {
    const now = new Date();
    const timeSinceHeartbeat = (now.getTime() - this.props.metrics.lastHeartbeat.getTime()) / 1000;
    return timeSinceHeartbeat > timeoutSeconds;
  }

  getSessionDuration(): number {
    const endTime = this.props.endedAt || new Date();
    const startTime = this.props.startedAt || this.props.createdAt;
    return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
  }

  private loadTrack(trackId: string, streamUrl?: string, cdnUrl?: string): void {
    this.props.currentTrackId = trackId;
    this.props.streamUrl = streamUrl;
    this.props.cdnUrl = cdnUrl;
    this.props.position = 0;
    this.props.state = PlaybackState.LOADING;
  }

  private updateActivity(): void {
    this.props.lastActivity = new Date();
    this.props.updatedAt = new Date();
  }

  private validateSession(): void {
    if (!this.props.userId?.trim()) {
      throw MusicError.validationError('userId', 'is required');
    }
    if (!this.props.deviceId?.trim()) {
      throw MusicError.validationError('deviceId', 'is required');
    }
    if (this.props.volume < 0 || this.props.volume > 100) {
      throw MusicError.validationError('volume', 'must be between 0 and 100');
    }
  }

  toJSON(): PlaybackSessionEntityProps {
    return { ...this.props };
  }
}

export type PlaybackSession = {
  id: string;
  userId: string;
  currentTrackId: string | null;
  status: string;
  queue: Array<{ id: string; trackId: string }>;
};
