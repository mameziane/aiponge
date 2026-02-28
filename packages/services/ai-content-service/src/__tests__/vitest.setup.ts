process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'test-internal-secret';
process.env.ENTRY_ENCRYPTION_KEY = process.env.ENTRY_ENCRYPTION_KEY || 'test-encryption-key-32chars-long!';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
