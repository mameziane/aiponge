/**
 * Song Package Assembler Contract
 * Handles the final assembly of song components into a complete package
 */

// Define local types since contracts/ISongGenerationPipeline doesn't exist
export interface SongMetadata {
  songId: string;
  title: string;
  displayName: string;
  album?: string;
  genre: string;
  mood: string;
  duration: number;
  language: string;
  framework: string;
  generatedAt: Date;
  version: string;
}

export interface LyricsResult {
  content: string;
  metadata: Record<string, unknown>;
}

export interface MelodyResult {
  audioData: Buffer | string;
  metadata: Record<string, unknown>;
}

export interface ArtworkResult {
  imageData: Buffer | string;
  metadata: Record<string, unknown>;
}

export interface SongPackage {
  songId: string;
  metadata: SongMetadata;
  structure: PackageStructure;
}

export interface SongPackageComponents {
  readonly songId: string;
  readonly lyrics: LyricsResult;
  readonly melody: MelodyResult;
  readonly artwork: ArtworkResult;
  readonly metadata: Record<string, unknown>;
}

export interface PackageStructure {
  readonly packageUrl: string;
  readonly lyricsFile: string;
  readonly audioFile: string;
  readonly artworkFile: string;
  readonly metadataFile: string;
  readonly manifestFile: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface IFileManager {
  createPackageStructure(components: {
    songId: string;
    audioFile: string;
    lyricsFile: string;
    artworkFile: string;
    metadata: SongMetadata;
  }): Promise<PackageStructure>;

  validateFiles(structure: PackageStructure): Promise<ValidationResult>;
  cleanup(songId: string): Promise<void>;
}

export interface IMetadataCompiler {
  compile(components: {
    songId: string;
    lyrics: Record<string, unknown>;
    melody: Record<string, unknown>;
    artwork: Record<string, unknown>;
    blueprint: Record<string, unknown>;
  }): Promise<SongMetadata>;
}

/**
 * Main Song Package Assembler Interface
 */
export interface ISongPackageAssembler {
  /**
   * Assemble components into a final song package
   */
  assembleSongPackage(components: SongPackageComponents): Promise<SongPackage>;

  /**
   * Validate the integrity of a song package
   */
  validatePackage(songPackage: SongPackage): Promise<ValidationResult>;

  /**
   * Get package information without full assembly (for status checks)
   */
  getPackageInfo(songId: string): Promise<{
    exists: boolean;
    size?: number;
    lastModified?: Date;
    components?: string[];
  }>;

  /**
   * Clean up temporary files and incomplete packages
   */
  cleanup(songId: string): Promise<void>;
}
