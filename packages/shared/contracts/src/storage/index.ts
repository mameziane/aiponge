import { z } from 'zod';

export const OrphanMarkRequestSchema = z.object({
  fileUrl: z.string(),
});

export type OrphanMarkRequest = z.infer<typeof OrphanMarkRequestSchema>;

export const OrphanMarkResponseSchema = z.object({
  success: z.boolean(),
  marked: z.number().optional(),
  error: z.string().optional(),
});

export type OrphanMarkResponse = z.infer<typeof OrphanMarkResponseSchema>;

async function getStorageServiceUrl(): Promise<string> {
  const envUrl = process.env.STORAGE_SERVICE_URL;
  if (envUrl) return envUrl;

  const port = process.env.STORAGE_SERVICE_PORT || '3002';
  const host = process.env.SERVICE_HOST || 'localhost';
  return `http://${host}:${port}`;
}

export async function markFileAsOrphaned(fileUrl: string): Promise<OrphanMarkResponse> {
  try {
    const baseUrl = await getStorageServiceUrl();
    const response = await fetch(`${baseUrl}/api/files/mark-orphaned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrl }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return (await response.json()) as OrphanMarkResponse;
  } catch (error) {
    console.error('Failed to mark file as orphaned:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function markMultipleFilesAsOrphaned(fileUrls: string[]): Promise<OrphanMarkResponse> {
  try {
    const baseUrl = await getStorageServiceUrl();
    const response = await fetch(`${baseUrl}/api/files/mark-orphaned-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileUrls }),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return (await response.json()) as OrphanMarkResponse;
  } catch (error) {
    console.error('Failed to mark files as orphaned:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
