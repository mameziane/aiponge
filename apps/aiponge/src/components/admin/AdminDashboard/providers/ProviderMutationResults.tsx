import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { createProviderStyles } from './styles';

interface ProviderMutationResultsProps {
  setPrimaryIsSuccess: boolean;
  setPrimaryIsError: boolean;
  setPrimaryError?: Error | null;
  testIsSuccess: boolean;
  testData?: { success: boolean; latencyMs?: number; error?: string } | null;
  testIdPrefix?: string;
}

export function ProviderMutationResults({
  setPrimaryIsSuccess,
  setPrimaryIsError,
  setPrimaryError,
  testIsSuccess,
  testData,
  testIdPrefix = '',
}: ProviderMutationResultsProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);

  return (
    <>
      {setPrimaryIsSuccess && (
        <View style={styles.testResult} data-testid={`section-${testIdPrefix}set-primary-result`}>
          <Ionicons name="checkmark-circle" size={16} color={colors.semantic.success} />
          <Text style={[styles.testResultText, { color: colors.semantic.success }]}>
            Successfully set as primary provider
          </Text>
        </View>
      )}

      {setPrimaryIsError && (
        <View style={styles.testResult} data-testid={`section-${testIdPrefix}set-primary-error`}>
          <Ionicons name="close-circle" size={16} color={colors.semantic.error} />
          <Text style={[styles.testResultText, { color: colors.semantic.error }]}>
            {setPrimaryError?.message || 'Failed to set as primary'}
          </Text>
        </View>
      )}

      {testIsSuccess && testData && (
        <View style={styles.testResult} data-testid={`section-${testIdPrefix}test-result`}>
          <Ionicons
            name={testData.success ? 'checkmark-circle' : 'close-circle'}
            size={16}
            color={testData.success ? colors.semantic.success : colors.semantic.error}
          />
          <Text
            style={[
              styles.testResultText,
              {
                color: testData.success ? colors.semantic.success : colors.semantic.error,
              },
            ]}
            data-testid={`text-${testIdPrefix}test-result`}
          >
            {testData.success
              ? `Test passed (${testData.latencyMs}ms)`
              : `Test failed: ${testData.error || 'Unknown error'}`}
          </Text>
        </View>
      )}
    </>
  );
}
