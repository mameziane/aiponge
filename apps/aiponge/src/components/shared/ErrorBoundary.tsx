import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Appearance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors as darkColors, BORDER_RADIUS } from '../../theme';
import { lightColors } from '../../theme/lightColors';
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

/**
 * Get the current theme colors at render time.
 * Class components can't use hooks, so we read from Appearance API directly.
 * This is called each render to stay in sync with system theme changes.
 */
function getThemeColors() {
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' ? lightColors : darkColors;
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
        const themeColors = getThemeColors();
        const themedStyles = createThemedStyles(themeColors);

        const title = (() => {
          try {
            return i18n.t('errorBoundary.title');
          } catch {
            return 'Something went wrong';
          }
        })();
        const message = (() => {
          try {
            return this.props.isSafetyCritical
              ? i18n.t('errorBoundary.safetyCriticalMessage')
              : i18n.t('errorBoundary.message');
          } catch {
            return 'An unexpected error occurred. Please try again.';
          }
        })();
        const tryAgain = (() => {
          try {
            return i18n.t('errorBoundary.tryAgain');
          } catch {
            return 'Try Again';
          }
        })();

        return (
          <View style={themedStyles.container}>
            <Ionicons name="warning-outline" size={48} color={themeColors.semantic.error} />
            <Text style={themedStyles.title}>{title}</Text>
            <Text style={themedStyles.message}>{message}</Text>
            {this.state.error?.message ? (
              <Text style={themedStyles.errorDetail} selectable>
                {this.state.error.message}
              </Text>
            ) : null}
            {!this.props.isSafetyCritical && (
              <TouchableOpacity style={themedStyles.button} onPress={this.handleRetry}>
                <Text style={themedStyles.buttonText}>{tryAgain}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      } catch {
        // Ultimate fallback — zero external dependencies, cannot fail.
        // Reached only if the themed fallback above itself throws (module init failure).
        // Uses system color scheme for basic dark/light support even in catastrophic crashes.
        const isDark = Appearance.getColorScheme() !== 'light';
        const fb = isDark ? ultimateFallbackDark : ultimateFallbackLight;
        return (
          <View style={fb.container}>
            <Text style={fb.title}>Something went wrong</Text>
            <Text style={fb.message}>An unexpected error occurred.</Text>
            {!this.props.isSafetyCritical && (
              <TouchableOpacity style={fb.button} onPress={this.handleRetry}>
                <Text style={fb.buttonText}>Try Again</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
    }

    return this.props.children;
  }
}

/**
 * Create themed styles at render time so they adapt to the current color scheme.
 * Not using StyleSheet.create here because it's called per-render — the object
 * is simple enough that the overhead is negligible for an error fallback screen.
 */
function createThemedStyles(themeColors: typeof darkColors) {
  return {
    container: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 24,
      backgroundColor: themeColors.background.primary,
    },
    title: {
      fontSize: 20,
      fontWeight: '600' as const,
      color: themeColors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      color: themeColors.text.secondary,
      textAlign: 'center' as const,
      marginBottom: 24,
    },
    errorDetail: {
      fontSize: 12,
      color: themeColors.semantic.error,
      textAlign: 'center' as const,
      marginBottom: 16,
      paddingHorizontal: 8,
      fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: undefined }),
    },
    button: {
      backgroundColor: themeColors.brand.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600' as const,
    },
  };
}

// Minimal styles — no theme imports, no external modules. Cannot fail.
const ultimateFallbackDark = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#1a1a2e',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f0f0f0',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#a280bc',
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

const ultimateFallbackLight = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F5F0F8',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#4a4a4a',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#a280bc',
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
