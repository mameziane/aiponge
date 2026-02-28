import { View } from 'react-native';
import { useThemeColors } from '../../src/theme';
import { DiscoverScreen } from '../../src/screens/user/DiscoverScreen';

export default function LibrarianDiscoverTab() {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <DiscoverScreen />
    </View>
  );
}
