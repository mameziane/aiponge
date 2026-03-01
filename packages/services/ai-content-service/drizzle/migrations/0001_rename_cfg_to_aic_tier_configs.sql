-- Migration: Rename cfg_tier_configs → aic_tier_configs
-- Purpose: Align table prefix with owning service (ai-content-service uses aic_* prefix)
-- This fixes the naming convention violation where cfg_* prefix implied ai-config-service ownership
--
-- IMPORTANT: Run this BEFORE deploying the code changes.
-- The new code expects the table to be named aic_tier_configs.
--
-- Rollback: ALTER TABLE aic_tier_configs RENAME TO cfg_tier_configs;
--           ALTER INDEX aic_tier_configs_tier_idx RENAME TO cfg_tier_configs_tier_idx;
--           ALTER INDEX aic_tier_configs_is_active_idx RENAME TO cfg_tier_configs_is_active_idx;

BEGIN;

-- Rename the table
ALTER TABLE cfg_tier_configs RENAME TO aic_tier_configs;

-- Rename the indexes to match the new table prefix
ALTER INDEX cfg_tier_configs_tier_idx RENAME TO aic_tier_configs_tier_idx;
ALTER INDEX cfg_tier_configs_is_active_idx RENAME TO aic_tier_configs_is_active_idx;

-- The unique constraint on 'tier' column is auto-renamed with the table in PostgreSQL
-- No separate ALTER needed for: cfg_tier_configs_tier_unique → handled automatically

COMMIT;
