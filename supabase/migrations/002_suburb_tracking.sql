-- SA LeadGen — Suburb tracking for systematic suburb-by-suburb scraping
-- Run this in the Supabase SQL editor after 001_initial.sql

CREATE TABLE IF NOT EXISTS scraped_suburbs (
  id             BIGSERIAL PRIMARY KEY,
  suburb         TEXT NOT NULL UNIQUE,
  scraped_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  businesses_found INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scraped_suburbs_suburb
  ON scraped_suburbs (LOWER(suburb));
