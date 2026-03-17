'use strict';

const { google } = require('googleapis');
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('./config');
const logger = require('./logger');

// googleapis/gaxios respects NO_PROXY — but *.googleapis.com is in NO_PROXY in
// this container, so direct connections are attempted and fail (no raw internet).
// Pass an explicit agent via clientOptions.transporterOptions to force all
// Google API and OAuth token requests through the proxy regardless of NO_PROXY.
const _proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const _proxyAgent = _proxyUrl ? new HttpsProxyAgent(_proxyUrl) : undefined;

let _portfolioCache = null;
let _cacheTime = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Load portfolio entries from the Google Sheet.
 * Each row: [Business/Project Name, Niche/Industry, Website URL, Description (optional)]
 *
 * Returns array of { name, niche, url, description }
 */
async function loadPortfolio() {
  // Return cached version if fresh
  if (_portfolioCache && _cacheTime && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _portfolioCache;
  }

  const serviceAccount = config.googleSheetsServiceAccount();
  const sheetId = config.portfolioSheetId();

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    ...(_proxyAgent ? { clientOptions: { transporterOptions: { agent: _proxyAgent } } } : {}),
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A:D',
  });

  const rows = response.data.values || [];
  // Skip header row if it looks like one
  const dataRows = rows[0] && /name|project|business/i.test(rows[0][0]) ? rows.slice(1) : rows;

  const portfolio = dataRows
    .filter((row) => row[0] && row[2]) // must have name and URL
    .map((row) => ({
      name: (row[0] || '').trim(),
      niche: (row[1] || '').trim().toLowerCase(),
      url: (row[2] || '').trim(),
      description: (row[3] || '').trim(),
    }));

  logger.info(`Loaded ${portfolio.length} portfolio entries from Google Sheets`);

  _portfolioCache = portfolio;
  _cacheTime = Date.now();
  return portfolio;
}

/**
 * Find the best matching portfolio entry for a given business category.
 * Returns the portfolio item or null if no reasonable match found.
 */
function matchPortfolio(portfolio, category) {
  if (!portfolio || portfolio.length === 0) return null;

  const categoryAliases = {
    trades: ['trade', 'plumb', 'electr', 'build', 'roof', 'paint', 'concret', 'construct'],
    automotive: ['auto', 'car', 'mechanic', 'panel', 'tyre', 'vehicle'],
    hospitality: ['cafe', 'coffee', 'restaurant', 'food', 'catering', 'bar', 'hospitality', 'eatery'],
    professional: ['account', 'bookkeep', 'lawyer', 'legal', 'financial', 'finance', 'plan'],
  };

  const aliases = categoryAliases[category] || [category];

  // Score each portfolio item
  const scored = portfolio.map((item) => {
    const niche = item.niche.toLowerCase();
    const desc = (item.description || '').toLowerCase();
    const name = item.name.toLowerCase();
    const combined = `${niche} ${desc} ${name}`;

    let score = 0;
    for (const alias of aliases) {
      if (combined.includes(alias)) score += 2;
    }
    // Bonus for exact category word
    if (combined.includes(category)) score += 1;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Only return a match if there's a meaningful score
  if (scored[0] && scored[0].score >= 2) {
    return scored[0].item;
  }

  return null;
}

module.exports = { loadPortfolio, matchPortfolio };
