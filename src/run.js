'use strict';

/**
 * Main orchestration — runs the full lead generation pipeline for one day.
 *
 * Flow:
 * 1. Load portfolio from Google Sheets
 * 2. Check for pending (previously scraped but unprocessed) businesses in DB
 * 3. Scrape new businesses from Google Maps via Apify if needed
 * 4. For each new lead: check deduplication, save to DB
 * 5. Qualify leads (website check), up to daily cap
 * 6. Generate personalised email via Claude
 * 7. Create Gmail draft
 * 8. Update DB record
 * 9. Log run summary
 */

const db = require('./db');
const { scrapeSuburb } = require('./scraper');
const { qualifyLead } = require('./qualifier');
const { loadPortfolio, matchPortfolio } = require('./portfolio');
const { generateEmail } = require('./emailGenerator');
const { createDraft } = require('./gmail');
const config = require('./config');
const logger = require('./logger');
const { ADELAIDE_SUBURBS } = require('./suburbs');

async function runDailyPipeline() {
  const startTime = Date.now();
  const dailyCap = config.dailyLeadCap();
  logger.info(`=== SA LeadGen daily run starting — cap: ${dailyCap} ===`);

  const summary = {
    run_at: new Date().toISOString(),
    leads_scraped: 0,
    leads_qualified: 0,
    drafts_created: 0,
    leads_skipped_no_email: 0,
    leads_skipped_duplicate: 0,
    errors: 0,
  };

  // Step 1: Load portfolio
  let portfolio = [];
  try {
    portfolio = await loadPortfolio();
  } catch (err) {
    logger.error('Failed to load portfolio — continuing without portfolio matching:', err.message);
  }

  // Step 2: Check for pending businesses from previous runs
  let pendingLeads = [];
  try {
    pendingLeads = await db.getPendingBusinesses(dailyCap * 3);
    logger.info(`Found ${pendingLeads.length} pending businesses from previous runs`);
  } catch (err) {
    logger.error('Could not fetch pending businesses:', err.message);
  }

  // Step 3: Scrape next suburb if we don't have enough pending leads
  let newLeads = [];
  let currentSuburb = null;
  const scrapeNeeded = pendingLeads.length < dailyCap * 2;
  if (scrapeNeeded) {
    try {
      currentSuburb = await db.getNextSuburb(ADELAIDE_SUBURBS);
      if (!currentSuburb) {
        logger.info('All suburbs have been scraped — nothing new to scrape');
      } else {
        logger.info(`Next suburb to scrape: ${currentSuburb}`);
        newLeads = await scrapeSuburb(currentSuburb);
        summary.leads_scraped = newLeads.length;
        logger.info(`Scraped ${newLeads.length} raw businesses from ${currentSuburb}`);
      }
    } catch (err) {
      logger.error('Scraping failed:', err.message);
      summary.errors++;
      if (pendingLeads.length === 0) {
        logger.error('No pending leads and scraping failed — aborting run');
        await db.logRunSummary({ ...summary, duration_ms: Date.now() - startTime });
        return;
      }
    }
  }

  // Step 4: Dedup and store new scraped leads
  const storedNewLeads = [];
  for (const lead of newLeads) {
    if (!lead.business_name) continue;
    try {
      const exists = await db.businessExists(lead.business_name, lead.suburb);
      if (exists) {
        summary.leads_skipped_duplicate++;
        continue;
      }
      const record = await db.insertBusiness({
        business_name: lead.business_name,
        category: lead.category,
        suburb: lead.suburb,
        phone: lead.phone,
        email: lead.email,
        website_url: lead.website_url,
        raw_address: lead.raw_address,
        maps_url: lead.maps_url,
        scraped_at: new Date().toISOString(),
        status: 'scraped',
        emailed: false,
      });
      storedNewLeads.push(record);
    } catch (err) {
      logger.warn(`Could not store lead ${lead.business_name}: ${err.message}`);
      summary.errors++;
    }
  }

  logger.info(
    `Stored ${storedNewLeads.length} new leads (${summary.leads_skipped_duplicate} duplicates skipped)`
  );

  // Mark suburb as fully scraped now that all results are stored
  if (currentSuburb) {
    try {
      await db.markSuburbScraped(currentSuburb, storedNewLeads.length);
      logger.info(`Marked ${currentSuburb} as scraped`);
    } catch (err) {
      logger.warn(`Could not mark suburb ${currentSuburb} as scraped: ${err.message}`);
    }
  }

  // Step 5–8: Qualify, generate emails, create Gmail drafts
  const allCandidates = [...pendingLeads, ...storedNewLeads];
  let draftsCreated = 0;

  for (const lead of allCandidates) {
    if (draftsCreated >= dailyCap) break;

    // Step 5: Qualify
    let qualResult;
    try {
      qualResult = await qualifyLead(lead);
    } catch (err) {
      logger.warn(`Qualification error for ${lead.business_name}: ${err.message}`);
      summary.errors++;
      continue;
    }

    if (!qualResult.qualified) {
      await db.updateBusiness(lead.id, { status: 'not_qualified' });
      continue;
    }

    summary.leads_qualified++;

    // Update email from qualification (may have scraped it from website)
    const contactEmail = qualResult.email;
    if (!contactEmail) {
      logger.info(`No email found for ${lead.business_name} — skipping draft`);
      await db.updateBusiness(lead.id, {
        qualification_reason: qualResult.reason,
        status: 'no_email',
      });
      summary.leads_skipped_no_email++;
      continue;
    }

    // Update lead with qualification data
    await db.updateBusiness(lead.id, {
      email: contactEmail,
      qualification_reason: qualResult.reason,
      qualified_at: new Date().toISOString(),
      status: 'qualified',
    });

    const qualifiedLead = { ...lead, email: contactEmail, qualification_reason: qualResult.reason };

    // Step 6: Match portfolio
    const portfolioMatch = matchPortfolio(portfolio, qualifiedLead.category);

    // Step 7: Generate email
    let emailContent;
    try {
      emailContent = await generateEmail(qualifiedLead, portfolioMatch);
    } catch (err) {
      logger.error(`Email generation failed for ${qualifiedLead.business_name}: ${err.message}`);
      summary.errors++;
      continue;
    }

    // Step 8: Create Gmail draft
    try {
      const draftId = await createDraft(qualifiedLead, emailContent.subject, emailContent.body);
      await db.updateBusiness(lead.id, {
        portfolio_match: portfolioMatch ? portfolioMatch.url : null,
        emailed: true,
        emailed_at: new Date().toISOString(),
        status: 'emailed',
        gmail_draft_id: draftId,
      });
      draftsCreated++;
      summary.drafts_created++;
      logger.info(
        `[${draftsCreated}/${dailyCap}] Draft created for ${qualifiedLead.business_name} (${qualResult.reason})`
      );
    } catch (err) {
      logger.error(`Gmail draft creation failed for ${qualifiedLead.business_name}: ${err.message}`);
      summary.errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  summary.duration_ms = durationMs;

  logger.info(`=== Run complete in ${(durationMs / 1000).toFixed(1)}s ===`);
  logger.info(`  Scraped: ${summary.leads_scraped}`);
  logger.info(`  Qualified: ${summary.leads_qualified}`);
  logger.info(`  Drafts created: ${summary.drafts_created}`);
  logger.info(`  Skipped (no email): ${summary.leads_skipped_no_email}`);
  logger.info(`  Skipped (duplicate): ${summary.leads_skipped_duplicate}`);
  logger.info(`  Errors: ${summary.errors}`);

  try {
    await db.logRunSummary(summary);
  } catch (err) {
    logger.warn('Could not save run summary:', err.message);
  }
}

// Allow running directly: `node src/run.js`
if (require.main === module) {
  runDailyPipeline().catch((err) => {
    logger.error('Fatal error in pipeline:', err);
    process.exit(1);
  });
}

module.exports = { runDailyPipeline };
