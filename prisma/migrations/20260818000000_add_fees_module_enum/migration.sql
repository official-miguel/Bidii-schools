-- Add FEES value to the Module enum
-- PostgreSQL requires ALTER TYPE ... ADD VALUE for enum additions.
-- The IF NOT EXISTS guard makes this idempotent so re-runs are safe.
ALTER TYPE "Module" ADD VALUE IF NOT EXISTS 'FEES';
