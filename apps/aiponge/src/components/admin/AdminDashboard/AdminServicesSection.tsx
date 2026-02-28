/**
 * Admin Services Section
 * Microservices, circuit breakers, and system diagnostics
 */

import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useAdminCircuitBreakers, useAdminServiceMetrics, useAdminSystemDiagnostics } from '@/hooks/admin';
import {
  SectionHeader,
  ServiceCard,
  CircuitBreakerCard,
  LoadingSection,
  ErrorSection,
  StatusBadge,
  createSharedStyles,
} from './shared';

export function AdminServicesSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const circuitBreakersQuery = useAdminCircuitBreakers();
  const servicesQuery = useAdminServiceMetrics();
  const diagnosticsQuery = useAdminSystemDiagnostics();

  return (
    <>
      {/* Services */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.services.microservices')} icon="server-outline" />
        {servicesQuery.isLoading ? (
          <LoadingSection />
        ) : servicesQuery.isError ? (
          <ErrorSection message={t('admin.services.failedToLoadServices')} />
        ) : servicesQuery.data?.services ? (
          <>
            <Text style={sharedStyles.timestampText}>
              Updated: {new Date(servicesQuery.data.timestamp).toLocaleTimeString()}
            </Text>
            {servicesQuery.data.services.map(service => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </>
        ) : (
          <Text style={sharedStyles.emptyText}>{t('admin.services.noServicesRegistered')}</Text>
        )}
      </View>

      {/* Circuit Breakers */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.services.circuitBreakers')} icon="git-branch-outline" />
        {circuitBreakersQuery.isLoading ? (
          <LoadingSection />
        ) : circuitBreakersQuery.isError ? (
          <ErrorSection message={t('admin.services.failedToLoadCircuitBreakers')} />
        ) : circuitBreakersQuery.data ? (
          <>
            <View style={sharedStyles.summaryRow}>
              <View style={sharedStyles.summaryItem}>
                <Text style={sharedStyles.summaryValue}>{circuitBreakersQuery.data.summary.totalBreakers}</Text>
                <Text style={sharedStyles.summaryLabel}>{t('admin.services.total')}</Text>
              </View>
              <View style={sharedStyles.summaryItem}>
                <Text style={[sharedStyles.summaryValue, { color: colors.semantic.success }]}>
                  {circuitBreakersQuery.data.summary.closedBreakers}
                </Text>
                <Text style={sharedStyles.summaryLabel}>{t('admin.services.closed')}</Text>
              </View>
              <View style={sharedStyles.summaryItem}>
                <Text style={[sharedStyles.summaryValue, { color: colors.semantic.warning }]}>
                  {circuitBreakersQuery.data.summary.halfOpenBreakers}
                </Text>
                <Text style={sharedStyles.summaryLabel}>{t('admin.services.halfOpen')}</Text>
              </View>
              <View style={sharedStyles.summaryItem}>
                <Text style={[sharedStyles.summaryValue, { color: colors.semantic.error }]}>
                  {circuitBreakersQuery.data.summary.openBreakers}
                </Text>
                <Text style={sharedStyles.summaryLabel}>{t('admin.services.open')}</Text>
              </View>
            </View>
            {circuitBreakersQuery.data.breakers.map(breaker => (
              <CircuitBreakerCard key={breaker.name} breaker={breaker} />
            ))}
          </>
        ) : null}
      </View>

      {/* System Diagnostics */}
      <View style={sharedStyles.section}>
        <SectionHeader title={t('admin.services.systemDiagnostics')} icon="analytics-outline" />
        {diagnosticsQuery.isLoading ? (
          <LoadingSection />
        ) : diagnosticsQuery.isError ? (
          <ErrorSection message={t('admin.services.failedToLoadDiagnostics')} />
        ) : diagnosticsQuery.data ? (
          <View style={sharedStyles.diagnosticsGrid}>
            <View style={sharedStyles.diagnosticCard}>
              <View style={sharedStyles.diagnosticHeader}>
                <Ionicons name="server" size={16} color={colors.brand.primary} />
                <Text style={sharedStyles.diagnosticTitle}>{t('admin.services.database')}</Text>
              </View>
              <StatusBadge
                status={diagnosticsQuery.data.database?.connected ? 'healthy' : 'unhealthy'}
                label={diagnosticsQuery.data.database?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              />
              {diagnosticsQuery.data.database?.latencyMs !== undefined && (
                <Text style={sharedStyles.diagnosticDetail}>Latency: {diagnosticsQuery.data.database.latencyMs}ms</Text>
              )}
            </View>
            <View style={sharedStyles.diagnosticCard}>
              <View style={sharedStyles.diagnosticHeader}>
                <Ionicons name="flash" size={16} color={colors.brand.primary} />
                <Text style={sharedStyles.diagnosticTitle}>{t('admin.services.redis')}</Text>
              </View>
              <StatusBadge
                status={diagnosticsQuery.data.redis?.connected ? 'healthy' : 'unhealthy'}
                label={diagnosticsQuery.data.redis?.connected ? 'CONNECTED' : 'DISCONNECTED'}
              />
              {diagnosticsQuery.data.redis?.latencyMs !== undefined && (
                <Text style={sharedStyles.diagnosticDetail}>Latency: {diagnosticsQuery.data.redis.latencyMs}ms</Text>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}
