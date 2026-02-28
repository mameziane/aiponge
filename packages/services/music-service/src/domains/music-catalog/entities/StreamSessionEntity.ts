/**
 * Stream Session Entity - Domain Model
 * Represents an active streaming session for music playback
 */

import { MusicError } from '../../../application/errors';

export interface StreamSessionEntityProps {
  id: string;
  userId: string;
  trackId: string;
  deviceId: string;
  quality: 'low' | 'medium' | 'high';
  type: 'on_demand' | 'live' | 'podcast';
  duration: number; // in seconds
  volume: number; // 0-100
  cdnUrl: string;
  startedAt: Date;
  endedAt?: Date;
  lastHeartbeat?: Date;
  isActive: boolean;
  bufferHealth: number; // 0-100 percentage
  bandwidth?: number; // in kbps
  errors: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class StreamSessionEntity {
  private props: StreamSessionEntityProps;

  constructor(props: StreamSessionEntityProps) {
    this.props = props;
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get trackId(): string {
    return this.props.trackId;
  }

  get deviceId(): string {
    return this.props.deviceId;
  }

  get quality(): 'low' | 'medium' | 'high' {
    return this.props.quality;
  }

  get type(): 'on_demand' | 'live' | 'podcast' {
    return this.props.type;
  }

  get duration(): number {
    return this.props.duration;
  }

  get volume(): number {
    return this.props.volume;
  }

  get cdnUrl(): string {
    return this.props.cdnUrl;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get endedAt(): Date | undefined {
    return this.props.endedAt;
  }

  get lastHeartbeat(): Date | undefined {
    return this.props.lastHeartbeat;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get bufferHealth(): number {
    return this.props.bufferHealth;
  }

  get bandwidth(): number | undefined {
    return this.props.bandwidth;
  }

  get errors(): string[] {
    return [...this.props.errors];
  }

  get metadata(): Record<string, unknown> {
    return { ...this.props.metadata };
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Business logic methods
  public updateHeartbeat(): void {
    this.props.lastHeartbeat = new Date();
    this.props.updatedAt = new Date();
  }

  public updateVolume(volume: number): void {
    if (volume < 0 || volume > 100) {
      throw MusicError.validationError('volume', 'must be between 0 and 100');
    }
    this.props.volume = volume;
    this.props.updatedAt = new Date();
  }

  public updateBufferHealth(health: number): void {
    if (health < 0 || health > 100) {
      throw MusicError.validationError('bufferHealth', 'must be between 0 and 100');
    }
    this.props.bufferHealth = health;
    this.props.updatedAt = new Date();
  }

  public updateBandwidth(bandwidth: number): void {
    this.props.bandwidth = bandwidth;
    this.props.updatedAt = new Date();
  }

  public addError(error: string): void {
    this.props.errors.push(error);
    this.props.updatedAt = new Date();
  }

  public endSession(): void {
    this.props.endedAt = new Date();
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  public updateDuration(duration: number): void {
    this.props.duration = duration;
    this.props.updatedAt = new Date();
  }

  public switchQuality(quality: 'low' | 'medium' | 'high'): void {
    this.props.quality = quality;
    this.props.updatedAt = new Date();
  }

  // Helper methods
  public isHealthy(): boolean {
    return this.props.bufferHealth > 50 && this.props.errors.length === 0;
  }

  public getSessionDuration(): number {
    const endTime = this.props.endedAt || new Date();
    return Math.floor((endTime.getTime() - this.props.startedAt.getTime()) / 1000);
  }

  public isExpired(timeoutMinutes: number = 60): boolean {
    if (!this.props.lastHeartbeat) {
      return false;
    }
    const timeoutMs = timeoutMinutes * 60 * 1000;
    return Date.now() - this.props.lastHeartbeat.getTime() > timeoutMs;
  }

  // Static factory methods
  public static create(
    props: Omit<
      StreamSessionEntityProps,
      | 'id'
      | 'endedAt'
      | 'lastHeartbeat'
      | 'isActive'
      | 'bufferHealth'
      | 'errors'
      | 'metadata'
      | 'createdAt'
      | 'updatedAt'
    >
  ): StreamSessionEntity {
    const now = new Date();
    return new StreamSessionEntity({
      ...props,
      id: crypto.randomUUID(),
      endedAt: undefined,
      lastHeartbeat: now,
      isActive: true,
      bufferHealth: 100,
      errors: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });
  }

  public toJSON(): StreamSessionEntityProps {
    return { ...this.props };
  }
}
