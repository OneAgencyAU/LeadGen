'use strict';

/**
 * Entry point — sets up the cron schedule and starts the process.
 *
 * Schedule: Tuesday–Friday at 8:00am ACST (Adelaide time)
 * Railway env: TZ=Australia/Adelaide
 *
 * Cron expression: "0 8 * * 2-5"
 *   - minute 0, hour 8, any day-of-month, any month, Tue(2)–Fri(5)
 */

const cron = require('node-cron');
const { runDailyPipeline } = require('./run');
const { startServer } = require('./server');
const logger = require('./logger');

// Validate required env vars on startup so Railway surfaces misconfiguration immediately
const REQUIRED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'APIFY_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'GOOGLE_SHEETS_SERVICE_ACCOUNT',
  'PORTFOLIO_SHEET_ID',
];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

validateEnv();

const CRON_SCHEDULE = '0 8 * * 2-5'; // Tue–Fri at 8:00am (process TZ = Australia/Adelaide)

logger.info('SA LeadGen service starting...');
logger.info(`Cron schedule: ${CRON_SCHEDULE} (${process.env.TZ || 'system timezone'})`);
logger.info(`Daily lead cap: ${process.env.DAILY_LEAD_CAP || 20}`);

// Schedule the daily run
cron.schedule(CRON_SCHEDULE, async () => {
  logger.info('Cron triggered — starting daily pipeline');
  try {
    await runDailyPipeline();
  } catch (err) {
    logger.error('Unhandled error in daily pipeline:', err);
  }
});

logger.info('Cron scheduled. Waiting for next run...');

// Start dashboard HTTP server
startServer().catch((err) => {
  logger.error('Failed to start dashboard server:', err);
});

// Keep the process alive (Railway always-on)
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});
