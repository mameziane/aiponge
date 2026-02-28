/**
 * aiponge Spacing Constants
 * Centralized spacing values for consistent layout across all screens
 */

export const spacing = {
  // Screen-level padding
  screenHorizontal: 12, // Main horizontal padding for screen containers
  screenVertical: 12, // Main vertical padding for screen containers

  // Component spacing
  componentGap: 8, // Gap between components in a section
  sectionGap: 12, // Gap between major sections

  // Element spacing
  elementPadding: 16, // Internal padding for elements (cards, inputs, etc.)
  elementMargin: 8, // Margin between elements

  // Edge spacing
  edgeInset: 4, // Minimal edge spacing

  // Content spacing
  contentBottom: 16, // Bottom padding for scrollable content
} as const;

export default spacing;
