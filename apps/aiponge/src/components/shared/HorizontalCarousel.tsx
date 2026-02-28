import { type ReactElement, useCallback } from 'react';
import { FlatList, type ListRenderItemInfo, StyleSheet } from 'react-native';

interface HorizontalCarouselProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => ReactElement;
  keyExtractor: (item: T, index: number) => string;
  testID?: string;
  contentPadding?: number;
  extraData?: unknown;
}

export function HorizontalCarousel<T>({
  data,
  renderItem,
  keyExtractor,
  testID,
  contentPadding = 16,
  extraData,
}: HorizontalCarouselProps<T>) {
  const flatListRenderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<T>) => renderItem(item, index),
    [renderItem]
  );

  return (
    <FlatList
      data={data}
      renderItem={flatListRenderItem}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.contentContainer, { paddingHorizontal: contentPadding }]}
      snapToInterval={172}
      snapToAlignment="start"
      decelerationRate="fast"
      testID={testID}
      extraData={extraData}
    />
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingVertical: 8,
  },
});
