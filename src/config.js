'use strict';

function required(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function optional(name, fallback = null) {
  return process.env[name] || fallback;
}

module.exports = {
  anthropicApiKey: () => required('ANTHROPIC_API_KEY'),
  apifyApiKey: () => required('APIFY_API_KEY'),
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseServiceKey: () => required('SUPABASE_SERVICE_KEY'),
  gmailClientId: () => required('GMAIL_CLIENT_ID'),
  gmailClientSecret: () => required('GMAIL_CLIENT_SECRET'),
  gmailRefreshToken: () => required('GMAIL_REFRESH_TOKEN'),
  googleSheetsServiceAccount: () => {
    const raw = required('GOOGLE_SHEETS_SERVICE_ACCOUNT');
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT must be valid JSON');
    }
  },
  portfolioSheetId: () => required('PORTFOLIO_SHEET_ID'),
  dailyLeadCap: () => parseInt(optional('DAILY_LEAD_CAP', '20'), 10),
  fromEmail: 'alex@toolr.ai',
  fromName: 'Alex',
  claudeModel: 'claude-sonnet-4-6',
  // Apify Google Maps Scraper actor
  apifyGoogleMapsActor: 'compass/crawler-google-places',
};
