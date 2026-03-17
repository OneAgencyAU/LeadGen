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

/**
 * Build all search strings for a given suburb — one per category query.
 * Returns [{ category, searchString }]
 */
function buildSuburbSearches(suburb) {
  const searches = [];
  for (const { category, queries } of SEARCH_CATEGORIES) {
    for (const query of queries) {
      searches.push({ category, searchString: `${query} in ${suburb} SA` });
    }
  }
  return searches;
}

/**
 * Infer category from Apify result categoryName field.
 */
function inferCategory(place) {
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
  const match = address.match(/,\s*([^,]+?)\s+SA\s+\d{4}/i);
  if (match) return match[1].trim();
  const parts = address.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim().replace(/\s+SA.*/i, '').trim();
  return '';
}

/**
 * Normalise a single Apify Google Maps result into our lead format.
 */
function normalisePlaceResult(place, category) {
  const lastReview = Array.isArray(place.reviews) && place.reviews.length > 0
    ? place.reviews[0].publishedAtDate || null
    : null;

  return {
    business_name: (place.title || place.name || '').trim(),
    category,
    suburb: parseSuburb(place.address || place.street || ''),
    phone: place.phone || place.phoneUnformatted || null,
    email: extractEmail(place),
    website_url: place.website || null,
    raw_address: place.address || null,
    maps_url: place.url || place.mapUrl || null,
    permanently_closed: place.permanentlyClosed === true || place.temporarilyClosed === true,
    last_review_date: lastReview,
  };
}

function extractEmail(place) {
  if (place.email) return place.email;
  if (Array.isArray(place.emails) && place.emails.length > 0) return place.emails[0];
  return null;
}

/**
 * Scrape all businesses in a single suburb across all category queries.
 * Returns array of normalised lead objects.
 */
async function scrapeSuburb(suburb) {
  const client = new ApifyClient({ token: config.apifyApiKey() });
  const searches = buildSuburbSearches(suburb);

  logger.info(`Scraping suburb: ${suburb} (${searches.length} category queries)`);

  const searchStrings = searches.map((s) => s.searchString);

  // Build a map so we can recover the category from the search string
  const categoryMap = {};
  searches.forEach((s) => {
    categoryMap[s.searchString] = s.category;
  });

  const run = await client.actor(config.apifyGoogleMapsActor).call(
    {
      searchStringsArray: searchStrings,
      // Small suburbs won't have more than ~20 of any one business type
      maxCrawledPlacesPerSearch: 20,
      language: 'en',
      country: 'AU',
      maxReviews: 1,
      exportPlaceUrls: false,
      additionalInfo: false,
      scrapeDirectories: false,
      scrapeImageUrls: false,
      scrapeResponseFromOwnerText: false,
      // Keep search geographically tight — don't expand beyond the suburb
      maxAutomaticZoomOut: 1,
    },
    { waitSecs: 300, memory: 1024 }
  );

  logger.info(`Apify run ${run.id} finished for ${suburb}. Fetching results...`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems({
    limit: searches.length * 25,
  });

  logger.info(`Apify returned ${items.length} raw results for ${suburb}`);

  const leads = [];
  for (const item of items) {
    if (!item.title && !item.name) continue;
    const category = inferCategory(item);
    const lead = normalisePlaceResult(item, category);
    if (lead.business_name) leads.push(lead);
  }

  logger.info(`Normalised ${leads.length} leads from ${suburb}`);
  return leads;
}

module.exports = { scrapeSuburb, SEARCH_CATEGORIES };
