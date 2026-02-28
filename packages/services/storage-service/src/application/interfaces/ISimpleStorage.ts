/**
 * Simple Storage Interface for Domain Services
 *
 * Temporary storage implementation to support domain services
 * while the full infrastructure layer is being developed.
 */

export interface IStorage {
  storeOnboardingData(_userId: number, _data: Record<string, unknown>): Promise<void>;
  getOnboardingData(_userId: number): Promise<Record<string, unknown> | null>;
  storePsychologicalInsight(_userId: number, _insight: unknown): Promise<void>;
  getPsychologicalInsights(_userId: number): Promise<unknown[]>;
  storeBehavioralPatterns(_userId: number, _patterns: Record<string, unknown>): Promise<void>;
  getBehavioralPatterns(_userId: number): Promise<Record<string, unknown> | null>;
  storeUserEvent(_event: unknown): Promise<void>;
  getUserPreferences(_userId: number): Promise<Record<string, unknown> | null>;
  clearUserContext(_userId: number): Promise<void>;
}

/**
 * Simple in-memory storage implementation
 * This is a temporary solution for development/testing
 */
export class SimpleStorage implements IStorage {
  private onboardingData: Map<number, Record<string, unknown>> = new Map();
  private psychologicalInsights: Map<number, unknown[]> = new Map();
  private behavioralPatterns: Map<number, Record<string, unknown>> = new Map();
  private userEvents: Array<unknown> = [];
  private userPreferences: Map<number, Record<string, unknown>> = new Map();

  async storeOnboardingData(userId: number, data: Record<string, unknown>): Promise<void> {
    const existing = this.onboardingData.get(userId) || {};
    this.onboardingData.set(userId, { ...existing, ...data });
  }

  async getOnboardingData(userId: number): Promise<Record<string, unknown> | null> {
    return this.onboardingData.get(userId) || null;
  }

  async storePsychologicalInsight(userId: number, insight: unknown): Promise<void> {
    const existing = this.psychologicalInsights.get(userId) || [];
    existing.push(insight);
    this.psychologicalInsights.set(userId, existing);
  }

  async getPsychologicalInsights(userId: number): Promise<unknown[]> {
    return this.psychologicalInsights.get(userId) || [];
  }

  async storeBehavioralPatterns(userId: number, patterns: Record<string, unknown>): Promise<void> {
    this.behavioralPatterns.set(userId, patterns);
  }

  async getBehavioralPatterns(userId: number): Promise<Record<string, unknown> | null> {
    return this.behavioralPatterns.get(userId) || null;
  }

  async storeUserEvent(event: unknown): Promise<void> {
    this.userEvents.push(event);
  }

  async getUserPreferences(userId: number): Promise<Record<string, unknown> | null> {
    return this.userPreferences.get(userId) || null;
  }

  async clearUserContext(userId: number): Promise<void> {
    this.onboardingData.delete(userId);
    this.psychologicalInsights.delete(userId);
    this.behavioralPatterns.delete(userId);
    this.userPreferences.delete(userId);
    // Remove user events (simplified approach)
    this.userEvents = this.userEvents.filter(event => (event as Record<string, unknown>)?.userId !== userId);
  }
}
