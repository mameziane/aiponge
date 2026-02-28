import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isLandscape: boolean;
  isPortrait: boolean;
  breakpoint: Breakpoint;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  columns: number;
  horizontalPadding: number;
  cardWidth: number;
  spacing: number;
  contentMaxWidth: number;
}

const BREAKPOINTS = {
  compact: 0,
  medium: 600,
  expanded: 840,
} as const;

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isLandscape = width > height;
    const isPortrait = !isLandscape;

    let breakpoint: Breakpoint = 'compact';
    if (width >= BREAKPOINTS.expanded) {
      breakpoint = 'expanded';
    } else if (width >= BREAKPOINTS.medium) {
      breakpoint = 'medium';
    }

    const isCompact = breakpoint === 'compact';
    const isMedium = breakpoint === 'medium';
    const isExpanded = breakpoint === 'expanded';

    let columns = 1;
    if (isExpanded) {
      columns = 3;
    } else if (isMedium || isLandscape) {
      columns = 2;
    }

    const horizontalPadding = isCompact ? 16 : isLandscape ? 24 : 20;

    const availableWidth = width - horizontalPadding * 2;
    const gap = isCompact ? 12 : 16;
    const cardWidth = columns > 1 ? (availableWidth - gap * (columns - 1)) / columns : availableWidth;

    const spacing = isCompact ? 12 : 16;

    const contentMaxWidth = isExpanded ? 1200 : isMedium ? 900 : width;

    return {
      width,
      height,
      isLandscape,
      isPortrait,
      breakpoint,
      isCompact,
      isMedium,
      isExpanded,
      columns,
      horizontalPadding,
      cardWidth,
      spacing,
      contentMaxWidth,
    };
  }, [width, height]);
}

/**
 * Helper to get a value based on breakpoint
 * Use with the layout object from useResponsiveLayout:
 * const layout = useResponsiveLayout();
 * const padding = getResponsiveValue(layout.breakpoint, 16, 24, 32);
 */
export function getResponsiveValue<T>(breakpoint: Breakpoint, compact: T, medium: T, expanded?: T): T {
  if (breakpoint === 'expanded' && expanded !== undefined) {
    return expanded;
  }
  if (breakpoint === 'medium' || breakpoint === 'expanded') {
    return medium;
  }
  return compact;
}
