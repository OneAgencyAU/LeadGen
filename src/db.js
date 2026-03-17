'use strict';

const { createClient } = require('@supabase/supabase-js');
const { ProxyAgent, fetch: undiciFetch } = require('undici');
const config = require('./config');
const logger = require('./logger');

let _client = null;

function getClient() {
  if (!_client) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    const customFetch = dispatcher
      ? (url, opts) => undiciFetch(url, { ...opts, dispatcher })
      : undefined;
    _client = createClient(config.supabaseUrl(), config.supabaseServiceKey(), {
      global: customFetch ? { fetch: customFetch } : {},
    });
  }
  return _client;
}

/**
 * Check if a business already exists in the DB (deduplication).
 * Matches on business_name + suburb (case-insensitive).
 */
async function businessExists(businessName, suburb) {
  const { data, error } = await getClient()
    .from('scraped_businesses')
    .select('id')
    .ilike('business_name', businessName)
    .ilike('suburb', suburb || '')
    .limit(1);

  if (error) throw new Error(`DB error checking business existence: ${error.message}`);
  return data && data.length > 0;
}

/**
 * Insert a new business record.
 */
async function insertBusiness(record) {
  const { data, error } = await getClient()
    .from('scraped_businesses')
    .insert([record])
    .select()
    .single();

  if (error) throw new Error(`DB error inserting business: ${error.message}`);
  return data;
}

/**
 * Update a business record by id.
 */
async function updateBusiness(id, updates) {
  const { error } = await getClient()
    .from('scraped_businesses')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`DB error updating business ${id}: ${error.message}`);
}

/**
 * Get businesses that were scraped but not yet qualified/emailed — for reuse on next run.
 * Returns up to `limit` records with status='scraped'.
 */
async function getPendingBusinesses(limit = 50) {
  const { data, error } = await getClient()
    .from('scraped_businesses')
    .select('*')
    .eq('status', 'scraped')
    .order('scraped_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`DB error fetching pending businesses: ${error.message}`);
  return data || [];
}

/**
 * Log the daily run summary.
 */
async function logRunSummary(summary) {
  const { error } = await getClient()
    .from('run_logs')
    .insert([summary]);

  if (error) {
    logger.warn('Could not log run summary (run_logs table may not exist):', error.message);
  }
}

/**
 * Return the first suburb from orderedList not yet in scraped_suburbs.
 * Returns null if all suburbs have been scraped.
 */
async function getNextSuburb(orderedList) {
  const { data, error } = await getClient()
    .from('scraped_suburbs')
    .select('suburb');

  if (error) throw new Error(`DB error fetching scraped suburbs: ${error.message}`);

  const done = new Set((data || []).map((r) => r.suburb.toLowerCase()));
  return orderedList.find((s) => !done.has(s.toLowerCase())) || null;
}

/**
 * Mark a suburb as fully scraped.
 */
async function markSuburbScraped(suburb, businessesFound = 0) {
  const { error } = await getClient()
    .from('scraped_suburbs')
    .upsert([{ suburb, businesses_found: businessesFound }], { onConflict: 'suburb' });

  if (error) throw new Error(`DB error marking suburb scraped: ${error.message}`);
}

module.exports = {
  getClient,
  businessExists,
  insertBusiness,
  updateBusiness,
  getPendingBusinesses,
  logRunSummary,
  getNextSuburb,
  markSuburbScraped,
};
