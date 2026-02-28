/**
 * Library Use Cases
 * Barrel export for all library-related use cases
 *
 * This module provides use cases for:
 * - Book operations (CRUD for all book types with role-based access)
 * - Chapter operations (CRUD with book ownership validation)
 * - Entry operations (CRUD with chapter/book ownership validation)
 * - Illustration operations (Add, Remove, Reorder with parent validation)
 *
 * All use cases implement role-based authorization:
 * - admin: Full access to all resources
 * - librarian: Access to public/shared content
 * - guest/explorer: Access to owned resources only
 */

export * from './shared';
export * from './book';
export * from './chapter';
export * from './entry';
export * from './illustration';
export * from './GenerateBookUseCase';
export * from './CloneBookUseCase';
