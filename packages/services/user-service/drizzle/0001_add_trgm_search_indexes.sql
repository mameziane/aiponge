-- Enable pg_trgm extension for trigram-based search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for ILIKE '%search%' queries on lib_books
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lib_books_title_trgm
  ON lib_books USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lib_books_author_trgm
  ON lib_books USING gin (author gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lib_books_description_trgm
  ON lib_books USING gin (description gin_trgm_ops);

-- Composite index for cursor pagination ORDER BY (created_at DESC, id DESC) WHERE deleted_at IS NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lib_books_cursor_pagination
  ON lib_books (created_at, id) WHERE deleted_at IS NULL;
