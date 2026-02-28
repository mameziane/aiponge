/**
 * File Orphan Marker
 * Simple utility to mark files as orphaned from any service
 * Uses DatabaseConnectionFactory for consistent connection management
 */

import { getLogger } from '../../config/service-urls';
import { getSQLConnection, type SQLConnection } from '../../infrastructure/database/DatabaseConnectionFactory';

const logger = getLogger('file-orphan-marker');

export class FileOrphanMarker {
  private sql: SQLConnection;

  constructor() {
    this.sql = getSQLConnection();
  }

  async markAsOrphaned(fileUrl: string): Promise<boolean> {
    if (!fileUrl) return false;

    try {
      const storagePath = this.extractStoragePath(fileUrl);
      if (!storagePath) {
        logger.warn('Could not extract storage path from URL', { fileUrl });
        return false;
      }

      const result = await this.sql`
        UPDATE stg_files 
        SET status = 'orphaned', orphaned_at = NOW(), updated_at = NOW()
        WHERE storage_path = ${storagePath} AND status = 'active'
        RETURNING id
      `;

      if (Array.isArray(result) && result.length > 0) {
        logger.info('Marked file as orphaned', { storagePath });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to mark file as orphaned', {
        fileUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async markMultipleAsOrphaned(fileUrls: string[]): Promise<number> {
    let markedCount = 0;
    for (const url of fileUrls) {
      if (await this.markAsOrphaned(url)) {
        markedCount++;
      }
    }
    return markedCount;
  }

  private extractStoragePath(fileUrl: string): string | null {
    if (!fileUrl) return null;

    const cleanUrl = fileUrl.split('?')[0].split('#')[0];

    try {
      if (!cleanUrl.startsWith('/') && !cleanUrl.startsWith('http')) {
        return cleanUrl;
      }

      if (cleanUrl.startsWith('/uploads/')) {
        return cleanUrl.replace('/uploads/', '');
      }

      if (cleanUrl.includes('/uploads/')) {
        const match = cleanUrl.match(/\/uploads\/(.+)$/);
        return match ? match[1] : null;
      }

      if (cleanUrl.startsWith('/')) {
        return cleanUrl.substring(1);
      }

      return cleanUrl;
    } catch {
      if (cleanUrl.includes('/uploads/')) {
        const match = cleanUrl.match(/\/uploads\/(.+)$/);
        return match ? match[1] : null;
      }
      return null;
    }
  }

  async close(): Promise<void> {}
}

let sharedInstance: FileOrphanMarker | null = null;

export function getFileOrphanMarker(): FileOrphanMarker {
  if (!sharedInstance) {
    sharedInstance = new FileOrphanMarker();
  }
  return sharedInstance;
}

export async function markFileAsOrphaned(fileUrl: string): Promise<boolean> {
  return getFileOrphanMarker().markAsOrphaned(fileUrl);
}
