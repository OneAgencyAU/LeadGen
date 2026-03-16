-- SA LeadGen — Add skipped_closed and skipped_stale columns to run_logs
-- Run this in the Supabase SQL editor after 001_initial.sql

ALTER TABLE run_logs
  ADD COLUMN IF NOT EXISTS leads_skipped_closed INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_skipped_stale  INT DEFAULT 0;
