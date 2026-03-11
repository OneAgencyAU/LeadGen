-- SA LeadGen — Initial Supabase Schema
-- Run this in the Supabase SQL editor for your project.

-- Main table: every business ever scraped or processed
CREATE TABLE IF NOT EXISTS scraped_businesses (
  id                   BIGSERIAL PRIMARY KEY,
  business_name        TEXT NOT NULL,
  category             TEXT,           -- trades / automotive / hospitality / professional
  suburb               TEXT,
  phone                TEXT,
  email                TEXT,           -- null if not found
  website_url          TEXT,
  raw_address          TEXT,
  maps_url             TEXT,
  qualification_reason TEXT,           -- no_website / broken / not_mobile / outdated / null
  portfolio_match      TEXT,           -- URL of portfolio item used in email, or null
  scraped_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qualified_at         TIMESTAMPTZ,
  emailed              BOOLEAN NOT NULL DEFAULT FALSE,
  emailed_at           TIMESTAMPTZ,
  gmail_draft_id       TEXT,
  status               TEXT NOT NULL DEFAULT 'scraped',
  -- status values: scraped | qualified | not_qualified | no_email | emailed
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplication index: same business in the same suburb is never processed twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_name_suburb
  ON scraped_businesses (LOWER(business_name), LOWER(COALESCE(suburb, '')));

-- Index for fetching pending businesses efficiently
CREATE INDEX IF NOT EXISTS idx_businesses_status
  ON scraped_businesses (status, scraped_at);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON scraped_businesses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Run logs table for daily summaries
CREATE TABLE IF NOT EXISTS run_logs (
  id                       BIGSERIAL PRIMARY KEY,
  run_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leads_scraped            INT DEFAULT 0,
  leads_qualified          INT DEFAULT 0,
  drafts_created           INT DEFAULT 0,
  leads_skipped_no_email   INT DEFAULT 0,
  leads_skipped_duplicate  INT DEFAULT 0,
  errors                   INT DEFAULT 0,
  duration_ms              INT
);
