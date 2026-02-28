import { View } from 'react-native';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { useThemeColors, type ColorScheme } from '../../theme';

const APP_ICON = require('../../../assets/icon.png');

const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const getGridSize = (progress: number): number => {
  if (progress < 5) return 2;
  if (progress < 15) return 4;
  if (progress < 30) return 8;
  if (progress < 50) return 16;
  if (progress < 75) return 24;
  return 32;
};

export const easeOutQuad = (t: number): number => t * (2 - t);

const generateScrambledPositions = (
  gridSize: number,
  progress: number,
  seed: number = 42
): { fromX: number; fromY: number; toX: number; toY: number }[][] => {
  const positions: { fromX: number; fromY: number; toX: number; toY: number }[][] = [];

  const allPositions: { x: number; y: number }[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      allPositions.push({ x: col, y: row });
    }
  }

  const shuffled = [...allPositions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const seedVal = seed + i * 7919;
    const j = Math.floor(seededRandom(seedVal) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const unscrambleProgress = progress / 100;
  let idx = 0;

  for (let row = 0; row < gridSize; row++) {
    const rowPositions: { fromX: number; fromY: number; toX: number; toY: number }[] = [];
    for (let col = 0; col < gridSize; col++) {
      const scrambledPos = shuffled[idx];
      const currentX = scrambledPos.x + (col - scrambledPos.x) * unscrambleProgress;
      const currentY = scrambledPos.y + (row - scrambledPos.y) * unscrambleProgress;
      rowPositions.push({
        fromX: currentX,
        fromY: currentY,
        toX: col,
        toY: row,
      });
      idx++;
    }
    positions.push(rowPositions);
  }

  return positions;
};

const generateIconPixelColors = (gridSize: number, progress: number, iconColors: readonly string[]): string[][] => {
  const grid: string[][] = [];
  const centerX = gridSize / 2;
  const centerY = gridSize / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let row = 0; row < gridSize; row++) {
    const rowColors: string[] = [];
    for (let col = 0; col < gridSize; col++) {
      const distX = col - centerX;
      const distY = row - centerY;
      const dist = Math.sqrt(distX * distX + distY * distY) / maxDist;

      const seed = row * 1000 + col * 7 + gridSize * 13;
      const randomValue = seededRandom(seed);
      const progressFactor = progress / 100;

      const organizedIndex = Math.floor((1 - dist) * 6);
      const randomIndex = Math.floor(randomValue * iconColors.length);
      const finalIndex = Math.floor(randomIndex * (1 - progressFactor) + organizedIndex * progressFactor);

      rowColors.push(iconColors[Math.max(0, Math.min(finalIndex, iconColors.length - 1))]);
    }
    grid.push(rowColors);
  }
  return grid;
};

interface IconRevealPixelGridProps {
  gridSize: number;
  size: number;
  progress: number;
  borderRadius?: number;
}

export function IconRevealPixelGrid({ gridSize, size, progress, borderRadius = 12 }: IconRevealPixelGridProps) {
  const colors = useThemeColors();
  const cellSize = size / gridSize;

  const iconColors = useMemo(() => colors.iconReveal, [colors]);
  const positions = useMemo(() => generateScrambledPositions(gridSize, progress), [gridSize, progress]);
  const pixelColors = useMemo(
    () => generateIconPixelColors(gridSize, progress, iconColors),
    [gridSize, progress, iconColors]
  );

  const iconOpacity = Math.min(1, progress / 80);
  const pixelOpacity = progress < 80 ? 1 : Math.max(0, 1 - (progress - 80) / 20);

  return (
    <View style={{ position: 'absolute', width: size, height: size }}>
      <Image
        source={APP_ICON}
        style={{
          position: 'absolute',
          width: size,
          height: size,
          opacity: iconOpacity,
          borderRadius,
        }}
        contentFit="cover"
      />

      <View style={{ position: 'absolute', width: size, height: size, opacity: pixelOpacity }}>
        {positions.map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={{ position: 'absolute', width: size, height: cellSize, top: rowIndex * cellSize }}
          >
            {row.map((pos, colIndex) => {
              const offsetX = (pos.fromX - pos.toX) * cellSize;
              const offsetY = (pos.fromY - pos.toY) * cellSize;

              return (
                <View
                  key={colIndex}
                  style={{
                    position: 'absolute',
                    left: colIndex * cellSize + offsetX,
                    top: offsetY,
                    width: cellSize + 0.5,
                    height: cellSize + 0.5,
                    backgroundColor: pixelColors[rowIndex][colIndex],
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
