import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MiniPlayer } from '../music/MiniPlayer';
import { useAdminCreateAction } from '../../contexts/AdminCreateContext';
import { useThemeColors } from '../../theme';

// Tab bar height defined in the layout files — used to calculate FAB vertical centering.
const TAB_BAR_HEIGHT = 70;
// FAB button size (width and height).
const FAB_SIZE = 56;

export function AppTabBar(props: BottomTabBarProps) {
  const { createAction } = useAdminCreateAction();
  const colors = useThemeColors();

  return (
    <View>
      <MiniPlayer />
      {createAction && (
        <View style={styles.createButtonContainer}>
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: colors.brand.primary }]}
            onPress={createAction.onPress}
            activeOpacity={0.8}
            accessibilityLabel={createAction.label}
            accessibilityRole="button"
          >
            <Ionicons name={createAction.icon} size={28} color={colors.interactive.primaryForeground} />
          </TouchableOpacity>
        </View>
      )}
      <BottomTabBar {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  createButtonContainer: {
    position: 'absolute',
    alignSelf: 'center',
    // Centre the FAB vertically within the tab bar:
    // (TAB_BAR_HEIGHT - FAB_SIZE) / 2 = (70 - 56) / 2 = 7
    bottom: (TAB_BAR_HEIGHT - FAB_SIZE) / 2,
    zIndex: 10,
  },
  createButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});
