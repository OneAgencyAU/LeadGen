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
 * Build a raw RFC 2822 email message.
 */
function buildRawEmail({ to, from, fromName, subject, body }) {
  const lines = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    '',
    body,
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

  const raw = buildRawEmail({
    to: toEmail,
    from: config.fromEmail,
    fromName: config.fromName,
    subject,
    body,
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
