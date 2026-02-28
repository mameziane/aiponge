/**
 * Lyrics Timestamp Generator
 * Converts plain lyrics with structure tags into time-synchronized lyrics
 * for Spotify-style highlighting during playback
 */

export interface SyncedLine {
  startTime: number;
  endTime: number;
  text: string;
  type?: string; // verse, chorus, bridge, intro, outro
}

interface TimingProfile {
  wordsPerSecond: number;
  pauseAfterLine: number; // seconds
  pauseAfterSection: number; // seconds
}

const DEFAULT_TIMING: TimingProfile = {
  wordsPerSecond: 2.5, // Natural speech/singing pace
  pauseAfterLine: 0.3, // Brief pause between lines
  pauseAfterSection: 0.8, // Longer pause between sections
};

// Timing adjustments for different section types
const SECTION_TIMING: Record<string, Partial<TimingProfile>> = {
  chorus: { wordsPerSecond: 3.0, pauseAfterLine: 0.2 }, // Choruses often faster
  verse: { wordsPerSecond: 2.5, pauseAfterLine: 0.3 },
  bridge: { wordsPerSecond: 2.3, pauseAfterLine: 0.4 }, // Bridges often slower, more emotional
  intro: { wordsPerSecond: 2.0, pauseAfterLine: 0.5 },
  outro: { wordsPerSecond: 2.0, pauseAfterLine: 0.5 },
};

/**
 * Counts words in a line of text
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

/**
 * Identifies the section type from a structure tag
 * e.g., "[Verse 1]", "[Chorus]", "[Bridge]"
 */
function extractSectionType(line: string): string | null {
  const match = line.match(/^\[(.*?)\]$/);
  if (!match) return null;

  const tag = match[1].toLowerCase();

  // Normalize section names
  if (tag.includes('verse')) return 'verse';
  if (tag.includes('chorus') || tag.includes('refrain')) return 'chorus';
  if (tag.includes('bridge')) return 'bridge';
  if (tag.includes('intro') || tag.includes('opening')) return 'intro';
  if (tag.includes('outro') || tag.includes('ending')) return 'outro';

  return null;
}

/**
 * Generates time-synchronized lyrics from plain lyrics with structure tags
 *
 * @param lyricsContent - Plain lyrics with [Verse], [Chorus] tags
 * @param songDuration - Optional song duration in seconds (if known)
 * @returns Array of synced lines with timestamps
 */
export function generateLyricsTimestamps(lyricsContent: string, songDuration?: number): SyncedLine[] {
  if (!lyricsContent) return [];

  const lines = lyricsContent.split('\n').map(line => line.trim());
  const syncedLines: SyncedLine[] = [];
  let currentTime = 0;
  let currentSection: string | null = null;

  for (const line of lines) {
    // Skip empty lines
    if (!line) continue;

    // Check if this is a section header
    const sectionType = extractSectionType(line);
    if (sectionType) {
      currentSection = sectionType;
      // Add extra pause before new section
      currentTime += DEFAULT_TIMING.pauseAfterSection;
      continue;
    }

    // Get timing profile for current section
    const timing = {
      ...DEFAULT_TIMING,
      ...(currentSection ? SECTION_TIMING[currentSection] || {} : {}),
    };

    // Calculate duration for this line based on word count
    const wordCount = countWords(line);
    const lineDuration = wordCount / timing.wordsPerSecond;

    const startTime = currentTime;
    const endTime = currentTime + lineDuration;

    syncedLines.push({
      startTime: Math.round(startTime * 100) / 100, // Round to 2 decimal places
      endTime: Math.round(endTime * 100) / 100,
      text: line,
      type: currentSection || undefined,
    });

    // Move time forward
    currentTime = endTime + timing.pauseAfterLine;
  }

  // If song duration is known, stretch/compress timestamps to fit
  if (songDuration && syncedLines.length > 0) {
    const totalEstimatedTime = syncedLines[syncedLines.length - 1].endTime;
    const timeScale = songDuration / totalEstimatedTime;

    // Only scale if the difference is significant (>10%)
    if (Math.abs(timeScale - 1.0) > 0.1) {
      syncedLines.forEach(line => {
        line.startTime = Math.round(line.startTime * timeScale * 100) / 100;
        line.endTime = Math.round(line.endTime * timeScale * 100) / 100;
      });
    }
  }

  return syncedLines;
}

/**
 * Updates existing synced lines to fit a known song duration
 * Useful when song is generated after lyrics
 */
export function adjustTimestampsToSongDuration(syncedLines: SyncedLine[], songDuration: number): SyncedLine[] {
  if (!syncedLines || syncedLines.length === 0) return syncedLines;

  const totalEstimatedTime = syncedLines[syncedLines.length - 1].endTime;
  const timeScale = songDuration / totalEstimatedTime;

  return syncedLines.map(line => ({
    ...line,
    startTime: Math.round(line.startTime * timeScale * 100) / 100,
    endTime: Math.round(line.endTime * timeScale * 100) / 100,
  }));
}
