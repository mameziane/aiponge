/**
 * Admin Dashboard Hooks
 * Hooks for fetching admin-specific data from the API gateway
 *
 * Refactored to use useAdminQuery factory to eliminate duplication.
 * See useAdminQuery.ts for the factory implementation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore } from '../../auth/store';
import { useAdminQuery, useIsAdmin, useIsLibrarian, ADMIN_CACHE_CONFIG } from '../admin/useAdminQuery';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { queryKeys } from '../../lib/queryKeys';
import { ADMIN_QUERY } from '../../constants/appConfig';

export interface ServiceInfo {
  name: string;
  host: string;
  port: number;
  healthCheckPath: string;
  healthy?: boolean;
  metadata?: {
    seeded?: boolean;
    seedTime?: string;
    version?: string;
  };
}

export interface CircuitBreakerStats {
  name: string;
  state: 'open' | 'closed' | 'half-open';
  failures: number;
  successes: number;
  timeouts: number;
  lastFailure?: string;
  lastSuccess?: string;
}

export interface CircuitBreakerSummary {
  totalBreakers: number;
  openBreakers: number;
  halfOpenBreakers: number;
  closedBreakers: number;
  totalFailures: number;
  totalSuccesses: number;
  totalTimeouts: number;
}

export interface HealthOverview {
  totalServices: number;
  activeServices: number;
  healthyServices: number;
  timestamp: string;
  uptime?: number;
  memoryUsage?: {
    used: number;
    total: number;
    percentage: number;
  };
}

export interface ProviderConfiguration {
  id: number;
  providerId: string;
  providerName: string;
  providerType: string;
  description: string;
  configuration: Record<string, unknown>;
  isActive: boolean;
  isPrimary: boolean;
  priority: number;
  costPerUnit: string;
  creditCost: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  createdAt: string;
  updatedAt: string;
}

export interface SystemDiagnostics {
  database: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  redis: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  services: ServiceInfo[];
  timestamp: string;
}

export function useAdminHealthOverview() {
  return useAdminQuery<HealthOverview>({
    endpoint: '/api/v1/admin/health-overview',
    cachePreset: 'FREQUENT',
    staleTime: ADMIN_QUERY.staleTime.normal,
  });
}

export function useAdminCircuitBreakers() {
  return useAdminQuery<{ summary: CircuitBreakerSummary; breakers: CircuitBreakerStats[] }>({
    endpoint: '/api/v1/admin/circuit-breaker-stats',
    cachePreset: 'REALTIME',
  });
}

export function useAdminServiceMetrics() {
  return useAdminQuery<{ services: ServiceInfo[]; timestamp: string }>({
    endpoint: '/api/v1/admin/service-metrics',
    cachePreset: 'FREQUENT',
  });
}

export function useAdminProviders() {
  return useAdminQuery<ProviderConfiguration[], { providers: ProviderConfiguration[]; total: number }>({
    endpoint: '/api/v1/admin/provider-configurations',
    cachePreset: 'STANDARD',
    select: raw => {
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === 'object' && 'providers' in raw && Array.isArray(raw.providers)) {
        return raw.providers;
      }
      return [];
    },
  });
}

export function useAdminSystemDiagnostics() {
  return useAdminQuery<SystemDiagnostics>({
    endpoint: '/api/v1/admin/system-diagnostics',
    cachePreset: 'STANDARD',
  });
}

export function useAdminSystemTopology() {
  return useAdminQuery<{ services: ServiceInfo[]; timestamp: string }>({
    endpoint: '/api/v1/admin/system-topology',
    cachePreset: 'STANDARD',
  });
}

export { useIsAdmin } from '../admin/useAdminQuery';

export interface MusicApiCredits {
  credits: number;
  extraCredits: number;
  totalCredits: number;
  lastSyncedAt?: string;
  nextSyncAt?: string;
  cached?: boolean;
}

export function useAdminMusicApiCredits() {
  return useAdminQuery<MusicApiCredits>({
    endpoint: '/api/v1/admin/musicapi-credits',
    cachePreset: 'SLOW',
  });
}

export interface UserCreditsStats {
  totalUsers: number;
  totalCreditsBalance: number;
  totalCreditsSpent: number;
  totalOrders: number;
  totalOrderRevenue: number;
  totalGiftsSent: number;
  totalGiftsClaimed: number;
  avgCreditsPerUser: number;
}

export function useAdminUserCreditsStats() {
  return useAdminQuery<UserCreditsStats>({
    endpoint: '/api/v1/admin/user-credits-stats',
    cachePreset: 'SLOW',
  });
}

export interface StoredError {
  id: string;
  correlationId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  errorCode?: string;
  message: string;
  stack?: string;
  service?: string;
  userId?: string;
  userAgent?: string;
}

export interface ErrorStats {
  totalErrors: number;
  last24Hours: number;
  lastHour: number;
  byStatusCode: Record<number, number>;
  byPath: Record<string, number>;
}

/** @deprecated Use ServiceResponse<{ errors: StoredError[]; stats: ErrorStats; timestamp: string }> instead */
export type RecentErrorsResponse = ServiceResponse<{
  errors: StoredError[];
  stats: ErrorStats;
  timestamp: string;
}>;

export interface RecentErrorsData {
  errors: StoredError[];
  stats: ErrorStats;
  timestamp: string;
}

export function useAdminRecentErrors(query?: {
  correlationId?: string;
  path?: string;
  statusCode?: number;
  limit?: number;
}) {
  const queryParams = new URLSearchParams();
  if (query?.correlationId) queryParams.set('correlationId', query.correlationId);
  if (query?.path) queryParams.set('path', query.path);
  if (query?.statusCode) queryParams.set('statusCode', query.statusCode.toString());
  if (query?.limit) queryParams.set('limit', query.limit.toString());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/admin/recent-errors${queryString ? `?${queryString}` : ''}`;

  return useAdminQuery<RecentErrorsData>({
    endpoint,
    queryKey: queryKeys.admin.recentErrors(query),
    cachePreset: 'REALTIME',
  });
}

export function useAdminErrorByCorrelationId(correlationId: string | null) {
  return useAdminQuery<StoredError>({
    endpoint: `/api/v1/admin/errors/${correlationId}`,
    queryKey: queryKeys.admin.errorByCorrelation(correlationId),
    cachePreset: 'STANDARD',
    enabled: !!correlationId,
  });
}

export interface MonitoringConfig {
  schedulerEnabled: boolean;
  schedulerRunning: boolean;
  taskCount: number;
  intervalSeconds: number;
}

export interface HealthCheckResult {
  id: number;
  healthCheckId: number;
  status: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  errorMessage: string | null;
  checkedAt: string;
}

export interface HealthSummary {
  totalChecks: number;
  healthyChecks: number;
  unhealthyChecks: number;
  unknownChecks: number;
  lastCheckTime: string | null;
  criticalIssues: number;
  warningIssues: number;
}

export interface MonitoringIssue {
  id: string;
  type: 'health_check' | 'alert';
  severity: 'critical' | 'warning' | 'info';
  source: string;
  message: string;
  timestamp: string;
}

export function useAdminMonitoringConfig() {
  return useAdminQuery<MonitoringConfig>({
    endpoint: '/api/v1/admin/monitoring-config',
    cachePreset: 'REALTIME',
  });
}

export function useAdminMonitoringHealthSummary() {
  return useAdminQuery<HealthSummary>({
    endpoint: '/api/v1/admin/monitoring-health-summary',
    cachePreset: 'FREQUENT',
    staleTime: ADMIN_QUERY.staleTime.normal,
  });
}

export function useAdminMonitoringIssues() {
  return useAdminQuery<MonitoringIssue[]>({
    endpoint: '/api/v1/admin/monitoring-issues',
    cachePreset: 'REALTIME',
  });
}

export interface ResilienceAlert {
  type: 'circuit_breaker' | 'bulkhead';
  severity: 'warning' | 'critical';
  message: string;
}

export interface ServiceResilienceStats {
  service: string;
  status: 'reachable' | 'unreachable';
  error?: string;
  circuitBreakers?: Array<{
    name: string;
    state: 'open' | 'closed' | 'half-open';
    failures: number;
    successes: number;
    timeouts: number;
  }>;
  bulkheads?: Array<{
    name: string;
    maxConcurrent: number;
    maxQueue: number;
    activeConcurrent: number;
    activeQueue: number;
    concurrentUtilization: number;
    queueUtilization: number;
    totalUtilization: number;
  }>;
  alerts?: ResilienceAlert[];
}

export interface AggregatedResilienceStats {
  timestamp: string;
  overallStatus: 'ok' | 'warning' | 'critical';
  hasAlerts: boolean;
  services: ServiceResilienceStats[];
}

export function useAdminResilienceStats() {
  return useAdminQuery<AggregatedResilienceStats>({
    endpoint: '/api/v1/admin/resilience-stats',
    cachePreset: 'REALTIME',
  });
}

export function useToggleMonitoringScheduler() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.post<ServiceResponse<MonitoringConfig>>('/api/v1/admin/monitoring-config', {
        schedulerEnabled: enabled,
      });
      return response.data;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'ADMIN_CONFIG_UPDATED' });
    },
  });
}

/**
 * Template variable - can be a simple string name or object with metadata
 */
export type TemplateVariable = string | { name: string; description?: string; required?: boolean };

/**
 * Get the display name from a template variable
 */
export function getVariableName(variable: TemplateVariable): string {
  return typeof variable === 'object' && variable !== null ? variable.name : variable;
}

export interface AIPromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
  systemPrompt?: string;
  userPromptStructure?: string;
  variables: TemplateVariable[];
  tags: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use ServiceResponse<{ templates: AIPromptTemplate[]; total: number; limit: number; offset: number }> instead */
export type AIPromptTemplatesResponse = ServiceResponse<{
  templates: AIPromptTemplate[];
  total: number;
  limit: number;
  offset: number;
}>;

export function useAdminAIPromptTemplates(category?: string) {
  const isLibrarian = useIsLibrarian();

  const queryParams = new URLSearchParams();
  if (category) queryParams.set('category', category);
  queryParams.set('limit', '100');

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/librarian/templates${queryString ? `?${queryString}` : ''}`;

  type AIPromptTemplatesData = { templates: AIPromptTemplate[]; total: number; limit: number; offset: number };

  return useQuery<AIPromptTemplatesData>({
    queryKey: queryKeys.admin.templates(category),
    queryFn: async (): Promise<AIPromptTemplatesData> => {
      try {
        const response = await apiClient.get<{ data?: Record<string, unknown>; [key: string]: unknown }>(endpoint);
        if (response?.data?.templates) {
          return response.data as unknown as AIPromptTemplatesData;
        }
        if (response?.templates) {
          return response as unknown as AIPromptTemplatesData;
        }
        return { templates: [], total: 0, limit: 100, offset: 0 };
      } catch (error) {
        return { templates: [], total: 0, limit: 100, offset: 0 };
      }
    },
    enabled: isLibrarian,
    staleTime: ADMIN_QUERY.staleTime.background,
  });
}

export function useAdminAIPromptCategories() {
  const isLibrarian = useIsLibrarian();

  return useQuery<{ categories: string[] }>({
    queryKey: queryKeys.admin.templateCategories(),
    queryFn: async () => {
      try {
        const response = await apiClient.get<{ data?: Record<string, unknown>; [key: string]: unknown }>(
          '/api/v1/librarian/templates?limit=100'
        );
        const templates = (response?.data?.templates || response?.templates || []) as Array<{ category?: string }>;
        const categorySet = new Set<string>();
        for (const t of templates) {
          if (t.category) categorySet.add(t.category);
        }
        return { categories: Array.from(categorySet).sort() };
      } catch (error) {
        return { categories: [] };
      }
    },
    enabled: isLibrarian,
    staleTime: 300000,
  });
}

export function useUpdateAIPromptTemplate() {
  const queryClient = useQueryClient();
  const isLibrarian = useIsLibrarian();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AIPromptTemplate> }) => {
      if (!isLibrarian) throw new Error('Unauthorized');
      const response = await apiClient.patch<ServiceResponse<AIPromptTemplate>>(
        `/api/v1/librarian/templates/${id}`,
        updates
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'ADMIN_TEMPLATES_UPDATED' });
    },
  });
}

export interface ProviderConfigurationUpdate {
  priority?: number;
  configuration?: Record<string, unknown>;
}

export function useUpdateProviderConfiguration() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: ProviderConfigurationUpdate }) => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.patch<ServiceResponse<ProviderConfiguration>>(
        `/api/v1/admin/provider-configurations/${id}`,
        updates
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'ADMIN_PROVIDERS_UPDATED' });
    },
  });
}

export interface CreateProviderInput {
  providerId: string;
  providerName: string;
  providerType: 'llm' | 'music' | 'image' | 'video' | 'audio' | 'text';
  description?: string;
  configuration: Record<string, unknown>;
  isActive?: boolean;
  isPrimary?: boolean;
  priority?: number;
  costPerUnit?: string;
  creditCost?: number;
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async (input: CreateProviderInput) => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.post<ServiceResponse<ProviderConfiguration>>(
        '/api/v1/admin/provider-configurations',
        input
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'ADMIN_PROVIDERS_UPDATED' });
    },
  });
}

export interface DiscoveredProvider {
  providerId: string;
  providerName: string;
  providerType: 'llm' | 'image' | 'music' | 'audio' | 'video';
  description: string;
  endpoint: string;
  model: string;
  timeout: number;
  costPerUnit: string;
  creditCost: number;
  priority: number;
  category: string;
}

export function useDiscoverProviders() {
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async () => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.post<
        ServiceResponse<{
          providers: DiscoveredProvider[];
          existingCount: number;
          suggestedCount: number;
        }>
      >('/api/v1/admin/provider-configurations/discover', {});
      return response.data;
    },
  });
}

export function useSetProviderAsPrimary() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async ({ id, providerType }: { id: number; providerType: string }) => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.post<ServiceResponse<unknown>>(
        `/api/v1/admin/provider-configurations/${id}/set-primary`,
        { providerType }
      );
      return response.data;
    },
    onSuccess: () => {
      invalidateOnEvent(queryClient, { type: 'ADMIN_PROVIDERS_UPDATED' });
    },
  });
}

export function useTestProviderConfiguration() {
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async (id: number) => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.post<ServiceResponse<{ success: boolean; latencyMs: number; error?: string }>>(
        `/api/v1/admin/provider-configurations/${id}/test`,
        {}
      );
      return response.data;
    },
  });
}

export function useRefreshMusicApiCredits() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  return useMutation({
    mutationFn: async () => {
      if (!isAdmin) throw new Error('Unauthorized');
      const response = await apiClient.post<ServiceResponse<MusicApiCredits>>(
        '/api/v1/admin/musicapi-credits/refresh',
        {}
      );
      return response.data;
    },
    onSuccess: data => {
      queryClient.setQueryData(queryKeys.admin.musicApiCredits(), data);
    },
  });
}

// ====================================
// PRODUCT METRICS
// ====================================

export interface ProductMetrics {
  activation?: {
    onboardingCompletionRate: number | null;
    completedOnboarding: number;
    totalUsers: number;
    avgTimeToFirstSongSeconds: number | null;
    firstSongCompletionRate: number | null;
  };
  engagement?: {
    songsPerActiveUserPerMonth: number | null;
    songReturnRate: number | null;
    journalEntriesPerUserPerMonth: number | null;
  };
  monetization?: {
    freeToPremiumConversionRate: number | null;
    creditPackPurchaseRate: number | null;
    premiumChurn30Day: number | null;
    premiumChurn90Day: number | null;
  };
  featureUsage?: {
    multipleJournalsRate: number | null;
    chaptersUsageRate: number | null;
    trackAlarmUsageRate: number | null;
    downloadsPerUser: number | null;
  };
  summary?: {
    totalUsers: number;
    activeUsersLast30Days: number;
    premiumUsers: number;
    totalSongsGenerated: number;
  };
  generatedAt?: string;
}

export function useAdminProductMetrics() {
  return useAdminQuery<ProductMetrics>({
    endpoint: '/api/v1/admin/product-metrics',
    cachePreset: 'ANALYTICS',
  });
}

// ====================================
// REPLAY RATE METRICS (North Star Metric)
// ====================================

export interface ReplayRateMetrics {
  weeklyReplayRate: number | null;
  distribution: {
    onePlay: number;
    twoPlays: number;
    threePlusPlays: number;
  };
  totalListeners: number;
  loyalListeners: number;
  topReplayedTracks: Array<{
    trackId: string;
    trackTitle: string;
    userId: string;
    replayCount: number;
  }>;
  avgPlaysPerTrack: number | null;
  periodDays: number;
  generatedAt: string;
}

export function useAdminReplayRate(days: number = 7) {
  return useAdminQuery<ReplayRateMetrics>({
    endpoint: `/api/v1/admin/replay-rate?days=${days}`,
    queryKey: ['/api/v1/admin/replay-rate', days],
    cachePreset: 'ANALYTICS',
  });
}
