import { useRef, useMemo, type FC } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityInfo, Platform } from 'react-native';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { spacing } from '../../theme/spacing';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';

export type EmotionalState = 0 | 1 | 2;

export const EMOTION_LABELS: Record<EmotionalState, 'centered' | 'stressed' | 'overwhelmed'> = {
  0: 'overwhelmed',
  1: 'centered',
  2: 'stressed',
};

export const EMOTION_COLORS: Record<EmotionalState, string> = {
  0: '#e8a0a0', // Dusty rose - overwhelmed
  1: '#a8d5ba', // Sage green - centered
  2: '#e8c890', // Soft sand - stressed
};

export function logEmotionSelection(entryId: string, value: EmotionalState) {
  logger.debug('Emotion selection', { entryId, value, label: EMOTION_LABELS[value] });
}

interface EmotionSliderProps {
  value: EmotionalState;
  onChange: (value: EmotionalState) => void;
  entryId?: string;
  disabled?: boolean;
  className?: string;
}

export const EmotionSlider: FC<EmotionSliderProps> = ({ value, onChange, entryId, disabled = false }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const containerRef = useRef<View>(null);

  const handleSelect = (newValue: EmotionalState) => {
    if (disabled || newValue === value) return;
    onChange(newValue);
    if (entryId) {
      logEmotionSelection(entryId, newValue);
    }
    if (Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(t(`emotions.${EMOTION_LABELS[newValue]}`));
    }
  };

  const handleKeyDown = (event: { nativeEvent: { key: string } }) => {
    if (disabled) return;
    const key = event.nativeEvent.key;
    if (key === 'ArrowRight' && value < 2) {
      handleSelect((value + 1) as EmotionalState);
    } else if (key === 'ArrowLeft' && value > 0) {
      handleSelect((value - 1) as EmotionalState);
    }
  };

  const states: EmotionalState[] = [0, 1, 2];

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      ref={containerRef}
      accessible={true}
      accessibilityRole="adjustable"
      accessibilityLabel={t('emotions.question')}
      accessibilityValue={{
        text: t(`emotions.${EMOTION_LABELS[value]}`),
        min: 0,
        max: 2,
        now: value,
      }}
      onAccessibilityAction={event => {
        if (disabled) return;
        if (event.nativeEvent.actionName === 'increment' && value < 2) {
          handleSelect((value + 1) as EmotionalState);
        } else if (event.nativeEvent.actionName === 'decrement' && value > 0) {
          handleSelect((value - 1) as EmotionalState);
        }
      }}
      accessibilityActions={[
        { name: 'increment', label: t('common.next') },
        { name: 'decrement', label: t('common.previous') },
      ]}
    >
      <Text style={styles.questionText}>{t('emotions.question')}</Text>

      <View style={styles.sliderContainer}>
        <View style={styles.track}>
          <View
            style={[
              styles.trackFill,
              {
                width: `${(value / 2) * 100}%`,
                backgroundColor: EMOTION_COLORS[value],
              },
            ]}
          />
        </View>

        <View style={styles.statesContainer}>
          {states.map(state => {
            const isSelected = value === state;
            const stateColor = EMOTION_COLORS[state];

            return (
              <Pressable
                key={state}
                style={[
                  styles.stateButton,
                  isSelected && styles.stateButtonSelected,
                  isSelected && { borderColor: stateColor },
                ]}
                onPress={() => handleSelect(state)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel={t(`emotions.${EMOTION_LABELS[state]}`)}
                {...(Platform.OS === 'web' ? { onKeyDown: handleKeyDown } : {})}
              >
                <View
                  style={[
                    styles.stateIndicator,
                    { backgroundColor: stateColor },
                    isSelected && styles.stateIndicatorSelected,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.labelsContainer}>
        {states.map(state => {
          const isSelected = value === state;
          const stateColor = EMOTION_COLORS[state];

          return (
            <Pressable key={state} style={styles.labelButton} onPress={() => handleSelect(state)} disabled={disabled}>
              <Text
                style={[styles.labelText, isSelected && styles.labelTextSelected, isSelected && { color: stateColor }]}
              >
                {t(`emotions.${EMOTION_LABELS[state]}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      paddingVertical: spacing.componentGap,
      paddingHorizontal: spacing.elementPadding,
    },
    disabled: {
      opacity: 0.5,
    },
    questionText: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 12,
    },
    sliderContainer: {
      position: 'relative',
      height: 32,
      justifyContent: 'center',
    },
    track: {
      position: 'absolute',
      left: '16.66%',
      right: '16.66%',
      height: 4,
      backgroundColor: colors.border.primary,
      borderRadius: 2,
    },
    trackFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 2,
    },
    statesContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 0,
    },
    stateButton: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.lg,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    stateButtonSelected: {
      backgroundColor: colors.background.primary,
      borderWidth: 2,
    },
    stateIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    stateIndicatorSelected: {
      width: 16,
      height: 16,
      borderRadius: BORDER_RADIUS.sm,
    },
    labelsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    labelButton: {
      flex: 1,
      alignItems: 'center',
    },
    labelText: {
      fontSize: 12,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    labelTextSelected: {
      fontWeight: '600',
      fontSize: 13,
    },
    helperText: {
      fontSize: 11,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: 12,
      fontStyle: 'italic',
      opacity: 0.7,
    },
  });

export default EmotionSlider;
