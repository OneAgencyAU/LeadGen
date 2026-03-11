#!/usr/bin/env node
'use strict';

/**
 * One-time OAuth2 setup script for Gmail.
 *
 * Run this LOCALLY before deploying to Railway:
 *   node scripts/setupGmailAuth.js
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET set in your local .env or environment
 *   - A Google Cloud project with Gmail API enabled
 *   - OAuth2 credentials configured with redirect URI: http://localhost:3000/oauth2callback
 *
 * This script will:
 *   1. Print an authorisation URL
 *   2. You visit the URL, authorise as alex@toolr.ai, and get a code
 *   3. You paste the code back here
 *   4. The script prints your GMAIL_REFRESH_TOKEN to add to Railway env vars
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const readline = require('readline');

// Load .env if present (for local dev)
try {
  require('dotenv').config();
} catch {
  // dotenv not installed — use existing env vars
}

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = ['https://www.googleapis.com/auth/gmail.compose'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in your environment first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force consent to always get a refresh token
});

console.log('\n=== Gmail OAuth2 Setup ===\n');
console.log('1. Open this URL in your browser (make sure you are signed in as alex@toolr.ai):\n');
console.log(authUrl);
console.log('\n2. Authorise the application.');
console.log('3. You will be redirected to localhost:3000. Copy the "code" from the URL.\n');

// Start a local server to catch the redirect
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/oauth2callback') {
    res.end('Not found');
    return;
  }

  const code = parsed.query.code;
  if (!code) {
    res.end('No code found in redirect');
    return;
  }

  res.end('<h1>Authorisation successful! You can close this window.</h1>');
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      console.error(
        '\nERROR: No refresh token returned. This happens if you have already authorised this app.'
      );
      console.error(
        'Go to https://myaccount.google.com/permissions and revoke access, then run this script again.'
      );
      process.exit(1);
    }

    console.log('\n=== SUCCESS ===\n');
    console.log('Add this to your Railway environment variables:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
    console.log('\nKeep this token secret — treat it like a password.\n');
  } catch (err) {
    console.error('Error exchanging code for tokens:', err.message);
    process.exit(1);
  }
});

server.listen(3000, () => {
  console.log('Waiting for OAuth2 redirect on http://localhost:3000/oauth2callback ...\n');
});
