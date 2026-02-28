export interface Profile {
  userId: string;
  totalInsights: number;
  totalReflections: number;
  totalEntries: number;
  onboardingInitialized: boolean;
  lastVisitedRoute: string | null;
  lastUpdated: Date;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface NewProfile {
  userId: string;
  totalInsights?: number;
  totalReflections?: number;
  totalEntries?: number;
  onboardingInitialized?: boolean;
  lastVisitedRoute?: string | null;
  lastUpdated?: Date;
  createdAt?: Date;
}
