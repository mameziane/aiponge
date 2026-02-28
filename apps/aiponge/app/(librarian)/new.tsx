import { View } from 'react-native';
import { useThemeColors } from '../../src/theme';

export default function LibrarianNewTab() {
  const colors = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: colors.background.primary }} />;
}
