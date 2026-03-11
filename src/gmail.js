'use strict';

const { google } = require('googleapis');
const config = require('./config');
const logger = require('./logger');

let _gmail = null;

function getGmailClient() {
  if (_gmail) return _gmail;

  const oauth2Client = new google.auth.OAuth2(
    config.gmailClientId(),
    config.gmailClientSecret()
  );

  oauth2Client.setCredentials({
    refresh_token: config.gmailRefreshToken(),
  });

  _gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return _gmail;
}

/**
 * Encode a string to base64url format (required by Gmail API).
 */
function encodeBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Convert plain text email body to HTML, preserving paragraph breaks.
 */
function plainTextToHtml(text) {
  return text
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Fetch the default Gmail signature for the authenticated account.
 * Returns an HTML string, or empty string if unavailable.
 */
async function getDefaultSignature() {
  try {
    const gmail = getGmailClient();
    const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const primary = (res.data.sendAs || []).find(s => s.isPrimary);
    return primary?.signature || '';
  } catch (err) {
    logger.warn('Could not fetch Gmail signature:', err.message);
    return '';
  }
}

/**
 * Build a raw RFC 2822 email message.
 */
function buildRawEmail({ to, from, fromName, subject, body, signature }) {
  const htmlBody = plainTextToHtml(body);
  const fullHtml = signature
    ? `${htmlBody}\n<br>\n<div>${signature}</div>`
    : htmlBody;

  const lines = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    '',
    fullHtml,
  ];
  return encodeBase64Url(lines.join('\r\n'));
}

/**
 * Create a Gmail draft for a lead.
 *
 * @param {object} lead - Lead record (must have .email)
 * @param {string} subject - Email subject
 * @param {string} body - Email body (plain text)
 * @returns {string} Gmail draft ID
 */
async function createDraft(lead, subject, body) {
  const toEmail = lead.email;
  if (!toEmail) {
    throw new Error(`No email address for lead: ${lead.business_name}`);
  }

  const signature = await getDefaultSignature();

  const raw = buildRawEmail({
    to: toEmail,
    from: config.fromEmail,
    fromName: config.fromName,
    subject,
    body,
    signature,
  });

  const gmail = getGmailClient();

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
      },
    },
  });

  const draftId = response.data.id;
  logger.info(`Created Gmail draft ${draftId} for ${lead.business_name} <${toEmail}>`);
  return draftId;
}

module.exports = { createDraft };
