import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import type { IconName } from '../../types/ui.types';

interface ChipOption<T extends string | number | null = string> {
  value: T;
  label: string;
  icon?: IconName;
}

interface SelectableChipGroupProps<T extends string | number | null = string> {
  options: ChipOption<T>[];
  selectedValue?: T;
  selectedValues?: T[];
  onSelect: (value: T) => void;
  loading?: boolean;
  loadingText?: string;
  multiSelect?: boolean;
  maxSelections?: number;
  columns?: 2 | 3 | 4;
  showCheckmark?: boolean;
  size?: 'small' | 'medium' | 'large';
  testIdPrefix?: string;
}

export function SelectableChipGroup<T extends string | number | null>({
  options,
  selectedValue,
  selectedValues = [],
  onSelect,
  loading = false,
  loadingText,
  multiSelect = false,
  maxSelections,
  columns = 3,
  showCheckmark = true,
  size = 'medium',
  testIdPrefix = 'chip',
}: SelectableChipGroupProps<T>) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.brand.primary} />
        <Text style={styles.loadingText}>{loadingText || t('common.loading')}</Text>
      </View>
    );
  }

  const isSelected = (value: T) => {
    if (multiSelect) {
      return selectedValues.includes(value);
    }
    return selectedValue === value;
  };

  const isDisabled = (value: T) => {
    if (!multiSelect || !maxSelections) return false;
    return selectedValues.length >= maxSelections && !selectedValues.includes(value);
  };

  const widthPercentage = columns === 2 ? '48%' : columns === 3 ? '31%' : '23%';
  const chipStyle = size === 'small' ? styles.chipSmall : size === 'large' ? styles.chipLarge : styles.chipMedium;

  return (
    <View style={styles.container}>
      {options.map(option => {
        const selected = isSelected(option.value);
        const disabled = isDisabled(option.value);
        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[
              styles.chip,
              chipStyle,
              { width: widthPercentage },
              selected && styles.chipSelected,
              disabled && styles.chipDisabled,
            ]}
            onPress={() => !disabled && onSelect(option.value)}
            disabled={disabled}
            testID={`${testIdPrefix}-${option.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
          >
            {option.icon && (
              <Ionicons
                name={option.icon}
                size={size === 'large' ? 24 : 16}
                color={selected ? colors.brand.primary : disabled ? colors.text.tertiary : colors.text.tertiary}
              />
            )}
            <Text style={[styles.label, selected && styles.labelSelected, disabled && styles.labelDisabled]}>
              {option.label}
            </Text>
            {showCheckmark && selected && <Ionicons name="checkmark-circle" size={14} color={colors.brand.primary} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: 13,
      color: colors.text.tertiary,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      backgroundColor: colors.background.primary,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    chipSmall: {
      paddingHorizontal: 6,
      paddingVertical: 4,
      minHeight: 28,
    },
    chipMedium: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      minHeight: 32,
    },
    chipLarge: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 44,
      gap: 8,
    },
    chipSelected: {
      backgroundColor: colors.background.subtle,
      borderColor: colors.brand.primary,
    },
    chipDisabled: {
      opacity: 0.5,
      backgroundColor: colors.background.secondary,
    },
    label: {
      fontSize: 13,
      color: colors.text.primary,
      textAlign: 'center',
    },
    labelSelected: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    labelDisabled: {
      color: colors.text.tertiary,
    },
  });

export default SelectableChipGroup;
