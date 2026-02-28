import { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { useTranslation } from '@/i18n';
import { createStyles } from './styles';

interface EntryDatePickerProps {
  selectedDate: Date;
  showDatePicker: boolean;
  isLoading: boolean;
  isKeyboardVisible: boolean;
  formatDisplayDate: (date: Date) => string;
  onShowPicker: () => void;
  onDateChange: (event: unknown, date?: Date) => void;
  onDismiss: () => void;
  dismissKeyboard: () => void;
}

export const EntryDatePicker = memo(function EntryDatePicker({
  selectedDate,
  showDatePicker,
  isLoading,
  isKeyboardVisible,
  formatDisplayDate,
  onShowPicker,
  onDateChange,
  onDismiss,
  dismissKeyboard,
}: EntryDatePickerProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handlePress = () => {
    if (isKeyboardVisible) dismissKeyboard();
    onShowPicker();
  };

  return (
    <>
      <View style={styles.datePickerRow}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={handlePress}
          disabled={isLoading}
          testID="button-entry-date"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.text.secondary} />
          <Text style={styles.dateText}>{formatDisplayDate(selectedDate)}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <View style={styles.datePickerContainer}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            themeVariant="dark"
            testID="date-picker-entry"
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.datePickerDoneButton} onPress={onDismiss} testID="button-date-picker-done">
              <Text style={styles.datePickerDoneText}>{t('common.done')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );
});
