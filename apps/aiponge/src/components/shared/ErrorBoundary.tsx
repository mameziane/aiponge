import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, BORDER_RADIUS } from '../../theme';
import { i18n } from '../../i18n';
import { logger } from '../../lib/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  isSafetyCritical?: boolean;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Wrap componentStack access in try/catch: on iOS 26, if the error was caused
    // by Hermes GC heap corruption, accessing errorInfo.componentStack triggers
    // GCScope::_newChunkAndPHV and can produce a secondary EXC_BAD_ACCESS crash.
    let componentStack: string | undefined;
    try {
      componentStack = errorInfo?.componentStack ?? undefined;
    } catch {
      componentStack = '[componentStack unavailable — possible Hermes GC corruption]';
    }

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    } else {
      logger.error('[ErrorBoundary] Uncaught error', error, { componentStack });
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Wrap the themed fallback in try/catch.
      // If this render method itself throws (e.g. because colors/i18n/Ionicons failed to
      // initialise during a crash cascade), React cannot call another error boundary on the
      // same component — it would produce a white screen with no recovery.
      // The inner try block uses themed components; the catch block uses a zero-dependency
      // hardcoded layout that cannot fail.
      try {
        const title = (() => { try { return i18n.t('errorBoundary.title'); } catch { return 'Something went wrong'; } })();
        const message = (() => {
          try {
            return this.props.isSafetyCritical
              ? i18n.t('errorBoundary.safetyCriticalMessage')
              : i18n.t('errorBoundary.message');
          } catch { return 'An unexpected error occurred. Please try again.'; }
        })();
        const tryAgain = (() => { try { return i18n.t('errorBoundary.tryAgain'); } catch { return 'Try Again'; } })();

        return (
          <View style={styles.container}>
            <Ionicons name="warning-outline" size={48} color={colors.semantic.error} />
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
            {this.state.error?.message ? (
              <Text style={styles.errorDetail} selectable>
                {this.state.error.message}
              </Text>
            ) : null}
            {!this.props.isSafetyCritical && (
              <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
                <Text style={styles.buttonText}>{tryAgain}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      } catch {
        // Ultimate fallback — zero external dependencies, cannot fail.
        // Reached only if the themed fallback above itself throws (module init failure).
        return (
          <View style={ultimateFallbackStyles.container}>
            <Text style={ultimateFallbackStyles.title}>Something went wrong</Text>
            <Text style={ultimateFallbackStyles.message}>An unexpected error occurred.</Text>
            {!this.props.isSafetyCritical && (
              <TouchableOpacity style={ultimateFallbackStyles.button} onPress={this.handleRetry}>
                <Text style={ultimateFallbackStyles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorDetail: {
    fontSize: 12,
    color: colors.semantic.error,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: undefined }),
  },
  button: {
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.sm,
  },
  buttonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});

// Minimal styles that use only React Native built-ins — no theme, no external modules.
const ultimateFallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
