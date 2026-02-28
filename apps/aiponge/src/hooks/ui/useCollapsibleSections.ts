/**
 * Collapsible Sections Hook
 *
 * Manages the expanded/collapsed state of UI sections with AsyncStorage persistence.
 * Users can personalize their screen by collapsing sections they don't need.
 */

import { useCallback } from 'react';
import { useAsyncStorageState } from './useAsyncStorageState';

export interface CollapsibleSectionsState {
  [sectionId: string]: boolean;
}

const DEFAULT_SECTIONS_STATE: CollapsibleSectionsState = {};

export function useCollapsibleSections(screenKey: string) {
  const storageKey = `collapsible_sections_${screenKey}`;

  const {
    value: sectionsState,
    setValue: setSectionsState,
    isLoading,
  } = useAsyncStorageState<CollapsibleSectionsState>({
    key: storageKey,
    defaultValue: DEFAULT_SECTIONS_STATE,
  });

  const isSectionExpanded = useCallback(
    (sectionId: string, defaultExpanded = true): boolean => {
      if (sectionsState[sectionId] === undefined) {
        return defaultExpanded;
      }
      return sectionsState[sectionId];
    },
    [sectionsState]
  );

  const toggleSection = useCallback(
    async (sectionId: string) => {
      const currentState = sectionsState[sectionId] ?? true;
      await setSectionsState({
        ...sectionsState,
        [sectionId]: !currentState,
      });
    },
    [sectionsState, setSectionsState]
  );

  const expandSection = useCallback(
    async (sectionId: string) => {
      await setSectionsState({
        ...sectionsState,
        [sectionId]: true,
      });
    },
    [sectionsState, setSectionsState]
  );

  const collapseSection = useCallback(
    async (sectionId: string) => {
      await setSectionsState({
        ...sectionsState,
        [sectionId]: false,
      });
    },
    [sectionsState, setSectionsState]
  );

  const resetAll = useCallback(async () => {
    await setSectionsState(DEFAULT_SECTIONS_STATE);
  }, [setSectionsState]);

  return {
    isSectionExpanded,
    toggleSection,
    expandSection,
    collapseSection,
    resetAll,
    isLoading,
  };
}
