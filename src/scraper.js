'use strict';

const { ApifyClient } = require('apify-client');
const config = require('./config');
const logger = require('./logger');

// Business categories and their Google Maps search terms
const SEARCH_CATEGORIES = [
  {
    category: 'trades',
    queries: ['plumbers', 'electricians', 'builders', 'roofers', 'painters', 'concreters'],
  },
  {
    category: 'automotive',
    queries: ['mechanics', 'panel beaters', 'auto electricians', 'tyre shops'],
  },
  {
    category: 'hospitality',
    queries: ['cafes', 'restaurants', 'takeaways', 'catering companies'],
  },
  {
    category: 'professional',
    queries: ['accountants', 'bookkeepers', 'lawyers', 'financial planners'],
  },
];

const SA_LOCATIONS = [
  'Adelaide SA',
  'Barossa Valley SA',
  'McLaren Vale SA',
  'Fleurieu Peninsula SA',
  'Mount Gambier SA',
  'Whyalla SA',
  'Port Augusta SA',
  'Gawler SA',
  'Victor Harbor SA',
  'Murray Bridge SA',
];

/**
 * Build a rotating set of search strings for today's run.
 * Uses the day of week to rotate through categories/locations so we don't
 * always scrape the same ones.
 */
function buildSearchStrings(count = 5) {
  const dayOfWeek = new Date().getDay(); // 0=Sun ... 6=Sat
  const allCombinations = [];

  for (const { category, queries } of SEARCH_CATEGORIES) {
    for (const query of queries) {
      for (const location of SA_LOCATIONS) {
        allCombinations.push({ category, searchString: `${query} in ${location}` });
      }
    }
  }

  // Rotate based on day to spread coverage across the week
  const offset = (dayOfWeek * 17) % allCombinations.length;
  const selected = [];
  for (let i = 0; i < count; i++) {
    selected.push(allCombinations[(offset + i) % allCombinations.length]);
  }

  return selected;
}

/**
 * Infer category from Apify result categoryName or search query context.
 */
function inferCategory(place, searchCategory) {
  if (searchCategory) return searchCategory;
  const name = (place.categoryName || '').toLowerCase();
  if (/plumb|electr|build|roof|paint|concret|trade/.test(name)) return 'trades';
  if (/mechanic|panel|auto|tyre|car/.test(name)) return 'automotive';
  if (/cafe|restaurant|takeaway|catering|food|coffee|bar/.test(name)) return 'hospitality';
  if (/account|bookkeep|lawyer|financial|legal|plan/.test(name)) return 'professional';
  return 'other';
}

/**
 * Parse suburb from address string like "123 Main St, Glenelg SA 5045, Australia"
 */
function parseSuburb(address) {
  if (!address) return '';
  // Try to extract suburb from SA address
  const match = address.match(/,\s*([^,]+?)\s+SA\s+\d{4}/i);
  if (match) return match[1].trim();
  // Fallback: second-to-last part before SA
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim().replace(/\s+SA.*/i, '').trim();
  return '';
}

/**
 * Normalise a single Apify Google Maps result into our lead format.
 */
function normalisePlaceResult(place, category) {
  return {
    business_name: (place.title || place.name || '').trim(),
    category,
    suburb: parseSuburb(place.address || place.street || ''),
    phone: place.phone || place.phoneUnformatted || null,
    email: extractEmail(place),
    website_url: place.website || null,
    raw_address: place.address || null,
    maps_url: place.url || place.mapUrl || null,
  };
}

function extractEmail(place) {
  // Apify sometimes returns emails array or single email field
  if (place.email) return place.email;
  if (Array.isArray(place.emails) && place.emails.length > 0) return place.emails[0];
  return null;
}

/**
 * Scrape businesses from Google Maps via Apify.
 * Returns array of normalised lead objects (not yet deduped or qualified).
 */
async function scrapeGoogleMaps(targetCount = 100) {
  const client = new ApifyClient({ token: config.apifyApiKey() });
  const searches = buildSearchStrings(6); // 6 search strings per run

  logger.info(`Starting Apify scrape with ${searches.length} search queries...`);

  const searchStrings = searches.map((s) => s.searchString);
  const categoryMap = {};
  searches.forEach((s) => {
    categoryMap[s.searchString] = s.category;
  });

  // Run the Apify Google Maps scraper
  const run = await client.actor(config.apifyGoogleMapsActor).call({
    searchStringsArray: searchStrings,
    maxCrawledPlacesPerSearch: Math.ceil(targetCount / searches.length) + 10,
    language: 'en',
    country: 'AU',
    maxReviews: 0,
    exportPlaceUrls: false,
    additionalInfo: false,
  });

  logger.info(`Apify run ${run.id} completed. Fetching results...`);

  // Fetch all results from the dataset
  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: targetCount * 3,
  });

  logger.info(`Apify returned ${items.length} raw results`);

  const leads = [];
  for (const item of items) {
    if (!item.title && !item.name) continue;
    // Try to determine category from search string used
    const category = inferCategory(item, null);
    const lead = normalisePlaceResult(item, category);
    if (lead.business_name) {
      leads.push(lead);
    }
  }

  logger.info(`Normalised ${leads.length} leads from Apify results`);
  return leads;
}

module.exports = { scrapeGoogleMaps, SEARCH_CATEGORIES, SA_LOCATIONS };
