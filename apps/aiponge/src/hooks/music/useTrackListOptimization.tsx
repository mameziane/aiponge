import { useCallback, useMemo } from 'react';

interface Track {
  id: string;
}

export const TRACK_ITEM_HEIGHT = 80;

interface OptimizationOptions {
  showsVerticalScrollIndicator?: boolean;
}

export function useTrackListOptimization<T extends Track>(options: OptimizationOptions = {}) {
  const { showsVerticalScrollIndicator = false } = options;

  const keyExtractor = useCallback((item: T) => item.id, []);

  const getItemLayout = useCallback(
    (_: ArrayLike<T> | null | undefined, index: number) => ({
      length: TRACK_ITEM_HEIGHT,
      offset: TRACK_ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const flatListProps = useMemo(
    () => ({
      initialNumToRender: 10,
      maxToRenderPerBatch: 10,
      windowSize: 5,
      removeClippedSubviews: true,
      showsVerticalScrollIndicator,
    }),
    [showsVerticalScrollIndicator]
  );

  return {
    keyExtractor,
    getItemLayout,
    flatListProps,
    TRACK_ITEM_HEIGHT,
  };
}

export default useTrackListOptimization;
