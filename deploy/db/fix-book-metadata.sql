-- Fix book metadata for existing records
-- Run against the production database after deploying the code changes.
--
-- 1. Set category='personal' on auto-provisioned system books missing it
UPDATE lib_books
SET category = 'personal', updated_at = NOW()
WHERE system_type IN ('default', 'bookmarks', 'shared-notes')
  AND category IS NULL;

-- 2. Set subtitle on "My Story" default books that have none
UPDATE lib_books
SET subtitle = 'Your personal space for reflection and growth', updated_at = NOW()
WHERE system_type = 'default'
  AND (subtitle IS NULL OR subtitle = '');

-- 3. Fix chapter_count stuck at 0 on books that actually have chapters
UPDATE lib_books b
SET chapter_count = (
      SELECT COUNT(*)
      FROM lib_chapters c
      WHERE c.book_id = b.id AND c.deleted_at IS NULL
    ),
    updated_at = NOW()
WHERE b.chapter_count = 0
  AND EXISTS (
      SELECT 1 FROM lib_chapters c
      WHERE c.book_id = b.id AND c.deleted_at IS NULL
  );

-- 4. Fix entry_count stuck at 0 on books that actually have entries
UPDATE lib_books b
SET entry_count = (
      SELECT COUNT(*)
      FROM lib_entries e
      WHERE e.book_id = b.id AND e.deleted_at IS NULL
    ),
    updated_at = NOW()
WHERE b.entry_count = 0
  AND EXISTS (
      SELECT 1 FROM lib_entries e
      WHERE e.book_id = b.id AND e.deleted_at IS NULL
  );
