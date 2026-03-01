import { useContext } from 'react';
import { View } from 'react-native';
import { useThemeColors } from '../../src/theme';
import { BookListScreen } from '../../src/screens/shared/BookListScreen';
import { LibrarianCreateContext } from './_layout';

export default function LibrarianBooksTab() {
  const colors = useThemeColors();
  const { bookCreationTrigger } = useContext(LibrarianCreateContext);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
      <BookListScreen embedded externalCreateTrigger={bookCreationTrigger} />
    </View>
  );
}
