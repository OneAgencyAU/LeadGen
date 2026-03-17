'use strict';

const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const logger = require('./logger');
const { runDailyPipeline } = require('./run');

let _pipelineRunning = false;

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(config.supabaseUrl(), config.supabaseServiceKey());
  }
  return _supabase;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Aggregate stats
  app.get('/api/stats', async (req, res) => {
    try {
      const supabase = getSupabase();

      const { data: businesses } = await supabase
        .from('scraped_businesses')
        .select('status');

      const statusCounts = { scraped: 0, qualified: 0, not_qualified: 0, no_email: 0, emailed: 0 };
      (businesses || []).forEach((r) => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });
      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

      const { data: runs } = await supabase
        .from('run_logs')
        .select('leads_scraped, leads_qualified, drafts_created, leads_skipped_no_email, leads_skipped_duplicate, errors');

      const totals = {
        leads_scraped: 0,
        leads_qualified: 0,
        drafts_created: 0,
        leads_skipped_no_email: 0,
        leads_skipped_duplicate: 0,
        errors: 0,
      };
      (runs || []).forEach((r) => {
        Object.keys(totals).forEach((k) => { totals[k] += r[k] || 0; });
      });

      const { data: lastRun } = await supabase
        .from('run_logs')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(1)
        .single();

      const qualRate = totals.leads_scraped > 0
        ? Math.round((totals.leads_qualified / totals.leads_scraped) * 100)
        : 0;

      const convRate = totals.leads_qualified > 0
        ? Math.round((totals.drafts_created / totals.leads_qualified) * 100)
        : 0;

      res.json({ statusCounts, total, totals, qualRate, convRate, lastRun: lastRun || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Last 14 run logs
  app.get('/api/runs', async (req, res) => {
    try {
      const { data } = await getSupabase()
        .from('run_logs')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(14);
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Leads with optional status filter and pagination (25/page)
  app.get('/api/leads', async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query.page || '0', 10));
      const limit = 25;
      const status = req.query.status;

      let query = getSupabase()
        .from('scraped_businesses')
        .select('id, business_name, category, suburb, status, qualification_reason, emailed_at, scraped_at, email, website_url')
        .order('scraped_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (status && status !== 'all') query = query.eq('status', status);

      const { data } = await query;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manual pipeline trigger
  app.post('/api/run', async (req, res) => {
    if (_pipelineRunning) {
      return res.status(409).json({ error: 'Pipeline already running' });
    }
    _pipelineRunning = true;
    res.json({ started: true });
    logger.info('Manual pipeline trigger via /api/run');
    try {
      await runDailyPipeline();
    } catch (err) {
      logger.error('Error in manually triggered pipeline:', err);
    } finally {
      _pipelineRunning = false;
    }
  });

  // Chart data for last 14 runs
  app.get('/api/chart', async (req, res) => {
    try {
      const { data } = await getSupabase()
        .from('run_logs')
        .select('run_at, leads_scraped, leads_qualified, drafts_created')
        .order('run_at', { ascending: true })
        .limit(14);
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    logger.info(`Dashboard server running on port ${PORT}`);
  });
}

module.exports = { startServer };
