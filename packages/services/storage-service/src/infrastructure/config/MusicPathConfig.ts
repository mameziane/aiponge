/**
 * Music Generation Path Configuration
 * Centralized configuration for music file paths
 *
 * Storage structure (unified - all content lives under user folders):
 * - All tracks: uploads/user/{userId}/tracks/
 * - All artwork: uploads/user/{userId}/artworks/
 */

import path from 'path';
import { findWorkspaceRoot } from '@aiponge/platform-core';

export class MusicPathConfig {
  private static readonly DEFAULT_USER_BASE = 'uploads/user';

  static getUserTracksPath(userId: string): string {
    const basePath = process.env.USER_BASE_PATH || this.DEFAULT_USER_BASE;
    return `${basePath}/${userId}/tracks`;
  }

  static getUserArtworksPath(userId: string): string {
    const basePath = process.env.USER_BASE_PATH || this.DEFAULT_USER_BASE;
    return `${basePath}/${userId}/artworks`;
  }

  static getUserTracksDirectory(userId: string): string {
    return path.join(findWorkspaceRoot(), this.getUserTracksPath(userId));
  }

  static getUserArtworksDirectory(userId: string): string {
    return path.join(findWorkspaceRoot(), this.getUserArtworksPath(userId));
  }

  static getUserTracksUrlPath(userId: string): string {
    const configPath = this.getUserTracksPath(userId);
    return configPath.startsWith('uploads/') ? configPath.substring(8) : configPath;
  }

  static getUserArtworksUrlPath(userId: string): string {
    const configPath = this.getUserArtworksPath(userId);
    return configPath.startsWith('uploads/') ? configPath.substring(8) : configPath;
  }

  static getUserTrackFileUrl(userId: string, filename: string): string {
    return `/uploads/${this.getUserTracksUrlPath(userId)}/${filename}`;
  }

  static getUserArtworkFileUrl(userId: string, filename: string): string {
    return `/uploads/${this.getUserArtworksUrlPath(userId)}/${filename}`;
  }

  static isUserTrackUrl(fileUrl: string): boolean {
    return fileUrl.includes('/user/') && fileUrl.includes('/tracks/');
  }

  static isUserArtworkUrl(fileUrl: string): boolean {
    return fileUrl.includes('/user/') && fileUrl.includes('/artworks/');
  }

  static extractUserIdFromUrl(fileUrl: string): string | null {
    const match = fileUrl.match(/\/user\/([^/]+)\/(tracks|artworks)\//);
    return match ? match[1] : null;
  }
}
