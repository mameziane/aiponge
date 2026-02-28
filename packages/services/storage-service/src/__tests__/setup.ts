/**
 * Test setup for Storage Service
 */

export const testUtils = {
  createMockDb: () => ({}),
};

export const mockDb = testUtils.createMockDb();

// Test data constants for storage service
export const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
export const TEST_STORAGE_CONFIG = {
  aws: {
    bucket: 'test-storage-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
  },
  gcp: {
    bucket: 'test-gcp-bucket',
    projectId: 'test-project',
    keyFilename: 'test-key.json',
  },
};

export const TEST_STORAGE_OBJECTS = {
  audioFile: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    filename: 'test-audio.mp3',
    contentType: 'audio/mpeg',
    size: 1024000,
    path: '/audio/test-audio.mp3',
  },
  imageFile: {
    id: '550e8400-e29b-41d4-a716-446655440002',
    filename: 'test-image.jpg',
    contentType: 'image/jpeg',
    size: 512000,
    path: '/images/test-image.jpg',
  },
};
