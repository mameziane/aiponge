import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import type { FontSize } from '../../hooks/book';

interface FontSizeControlProps {
  visible: boolean;
  currentSize: FontSize;
  onSelect: (size: FontSize) => void;
  onClose: () => void;
}

const SIZES: { key: FontSize; labelKey: string; preview: number }[] = [
  { key: 'xs', labelKey: 'reader.fontSizes.xs', preview: 14 },
  { key: 's', labelKey: 'reader.fontSizes.s', preview: 16 },
  { key: 'm', labelKey: 'reader.fontSizes.m', preview: 18 },
  { key: 'l', labelKey: 'reader.fontSizes.l', preview: 20 },
  { key: 'xl', labelKey: 'reader.fontSizes.xl', preview: 24 },
];

export function FontSizeControl({ visible, currentSize, onSelect, onClose }: FontSizeControlProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('reader.fontSize')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {SIZES.map(size => (
            <TouchableOpacity
              key={size.key}
              style={[styles.option, currentSize === size.key && styles.optionSelected]}
              onPress={() => {
                onSelect(size.key);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionLabel, { fontSize: size.preview }]}>Aa</Text>
              <Text style={styles.optionName}>{t(size.labelKey)}</Text>
              {currentSize === size.key && <Ionicons name="checkmark" size={20} color={colors.brand.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'center',
      alignItems: 'center',
    },
    container: {
      width: '80%',
      maxWidth: 320,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.lg,
      padding: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 8,
    },
    optionSelected: {
      backgroundColor: colors.background.subtle,
    },
    optionLabel: {
      color: colors.text.primary,
      fontWeight: '600',
      width: 48,
    },
    optionName: {
      flex: 1,
      fontSize: 15,
      color: colors.text.secondary,
      marginLeft: 8,
    },
  });
