'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('./logger');

const HTTP_TIMEOUT_MS = 10000;
const OUTDATED_YEAR_THRESHOLD = 2024; // qualify sites last updated 2023 or earlier

/**
 * Qualify a lead based on their web presence.
 * Returns { qualified: boolean, reason: string|null, email: string|null }
 */
async function qualifyLead(lead) {
  const { website_url } = lead;

  // 1. No website — skip (can't scrape email, pitch doesn't apply)
  if (!website_url || website_url.trim() === '') {
    return { qualified: false, reason: null, email: lead.email };
  }

  // 2. Try to fetch the website
  let response;
  try {
    response = await axios.get(normaliseUrl(website_url), {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LeadQualifier/1.0; +https://toolr.ai)',
      },
      validateStatus: () => true, // don't throw on 4xx/5xx
    });
  } catch (err) {
    logger.debug(`Website fetch failed for ${website_url}: ${err.message}`);
    return { qualified: false, reason: null, email: lead.email };
  }

  // 3. Broken / 404 — skip (can't scrape email)
  if (response.status === 404 || response.status >= 500) {
    return { qualified: false, reason: null, email: lead.email };
  }

  // 4. Non-HTML responses (parking pages, etc.)
  const contentType = response.headers['content-type'] || '';
  if (!contentType.includes('text/html')) {
    return { qualified: false, reason: null, email: lead.email };
  }

  const html = typeof response.data === 'string' ? response.data : '';
  const $ = cheerio.load(html);

  // 5. Website signals that the business is closed
  if (appearsClosedFromContent($, html)) {
    return { qualified: false, reason: 'appears_closed', email: lead.email };
  }

  // 6. Outdated website (2023 or earlier), or no date detectable — this is our target
  const buildYear = detectBuildYear($, html, response.headers);
  if (!buildYear || buildYear < OUTDATED_YEAR_THRESHOLD) {
    const scrapedEmail = extractEmailFromHtml($, html) || lead.email;
    return { qualified: true, reason: buildYear ? 'outdated' : 'undated', email: scrapedEmail };
  }

  // 8. Try to extract email even for non-qualifying sites (for future use)
  const scrapedEmail = extractEmailFromHtml($, html) || lead.email;
  return { qualified: false, reason: null, email: scrapedEmail };
}

/**
 * Check page content for signals that the business has closed down.
 */
function appearsClosedFromContent($, html) {
  const CLOSED_PATTERNS = [
    /permanently\s+closed/i,
    /no longer (trading|operating|open|in business)/i,
    /we\s+(have\s+)?(closed|shut)/i,
    /closed\s+(down|our doors|for good|permanently)/i,
    /ceased\s+trading/i,
    /out of business/i,
    /winding\s+up/i,
    /business\s+has\s+closed/i,
  ];

  const bodyText = $('body').text();
  return CLOSED_PATTERNS.some(pattern => pattern.test(bodyText) || pattern.test(html));
}

/**
 * Detect the approximate build/last-update year from page HTML signals.
 * Returns a year number or null if undetectable.
 */
function detectBuildYear($, html, headers = {}) {
  const signals = [];

  // Copyright year in footer
  const footerText = $('footer').text() + $('[class*="footer"]').text();
  const copyrightMatches = footerText.match(/©\s*(\d{4})/g) || html.match(/©\s*(\d{4})/g) || [];
  for (const m of copyrightMatches) {
    const year = parseInt(m.replace(/[^0-9]/g, ''), 10);
    if (year >= 2000 && year <= 2030) signals.push(year);
  }

  // Meta generator (WordPress, Joomla etc. sometimes include version/year)
  const generator = $('meta[name="generator"]').attr('content') || '';
  const genYear = generator.match(/20\d{2}/);
  if (genYear) signals.push(parseInt(genYear[0], 10));

  // <meta name="revised"> or <meta name="date">
  const revised = $('meta[name="revised"], meta[name="date"]').attr('content') || '';
  const revisedYear = revised.match(/20\d{2}/);
  if (revisedYear) signals.push(parseInt(revisedYear[0], 10));

  // Last-Modified response header
  const lastModified = headers['last-modified'];
  if (lastModified) {
    const lmYear = new Date(lastModified).getFullYear();
    if (lmYear >= 2000 && lmYear <= 2030) signals.push(lmYear);
  }

  if (signals.length === 0) return null;

  // Use the minimum year found as a conservative estimate of build year
  return Math.min(...signals);
}

/**
 * Extract email addresses from page HTML.
 */
function extractEmailFromHtml($, html) {
  // Look for mailto: links first
  const mailtoHrefs = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].trim();
    if (isValidEmail(email)) mailtoHrefs.push(email);
  });
  if (mailtoHrefs.length > 0) return mailtoHrefs[0];

  // Regex fallback in raw HTML
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(emailRegex) || [];
  const filtered = matches.filter(
    (e) =>
      isValidEmail(e) &&
      !e.includes('example.com') &&
      !e.includes('sentry') &&
      !e.includes('wix') &&
      !e.includes('wordpress') &&
      !e.endsWith('.png') &&
      !e.endsWith('.jpg')
  );

  return filtered.length > 0 ? filtered[0] : null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function normaliseUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`;
  }
  return url;
}

module.exports = { qualifyLead };
