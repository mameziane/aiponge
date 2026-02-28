import { View } from 'react-native';
import { useThemeColors } from '../../src/theme';
import { BookDetailScreen } from '../../src/screens/shared/BookDetailScreen';

export default function LibrarianBookDetailPage() {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <BookDetailScreen mode="manage" />
    </View>
  );
}
