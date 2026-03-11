'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const logger = require('./logger');

let _client = null;

function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: config.anthropicApiKey() });
  }
  return _client;
}

const QUALIFICATION_LABELS = {
  no_website: 'no website at all',
  broken: 'a broken or non-functioning website',
  not_mobile: 'a website that is not mobile-friendly',
  outdated: 'a website that looks like it was built before 2016',
};

/**
 * Generate a personalised cold email for a qualified lead.
 *
 * @param {object} lead - The qualified lead record
 * @param {object|null} portfolioMatch - Best matching portfolio entry, or null
 * @returns {{ subject: string, body: string }}
 */
async function generateEmail(lead, portfolioMatch) {
  const currentYear = new Date().getFullYear();
  const qualificationDesc = QUALIFICATION_LABELS[lead.qualification_reason] || 'a web presence that needs work';
  const portfolioContext = portfolioMatch
    ? `Portfolio match found:
  - Project: ${portfolioMatch.name}
  - Niche: ${portfolioMatch.niche}
  - URL: ${portfolioMatch.url}
  - Description: ${portfolioMatch.description || 'N/A'}
  Reference this naturally in the email — let it speak for itself. Don't force it.`
    : `No close portfolio match found. Do NOT make up or reference a portfolio project. Omit that element entirely.`;

  const systemPrompt = `You are writing cold emails on behalf of Alex from toolr.ai — a web developer based in South Australia. The current year is ${currentYear}.

Alex's voice:
- Casual, warm Australian tone — 'reckon', 'chuck', 'no worries', 'keen' used naturally (not forced)
- Short — 4 to 6 sentences maximum in the email body
- Reads like a real person who actually looked at their business, not a mail merge
- Light humour in the opening or subject line — poking fun at the gap, not the business owner
- Confident without being arrogant — Alex is doing them a favour, not begging for work
- Never sycophantic, never desperate
- Professional but not stiff — like a good tradie who takes pride in their work

Email structure:
1. Opening: Warm, slightly cheeky observation about their web presence issue
2. Credibility: Casually reference a relevant portfolio site if one is provided (let the work speak)
3. Hook: Alex has put together a free homepage concept for them — no strings, genuinely
4. CTA: One easy question — keen to take a look?
5. Sign-off: "Alex — toolr.ai"

Subject line rules:
- Conversational, a little unexpected, honest
- Avoid anything that sounds like marketing spam
- Rotate style — don't use the same formula every time
- Examples: "Oi [Business Name] — I built you something (no catch)", "Free homepage concept for [Business Name] — genuinely no strings"

Return your response as JSON with this exact shape:
{"subject": "...", "body": "..."}

The body should use paragraphs separated by blank lines. No HTML tags.`;

  const userPrompt = `Generate a cold email for this SA business:

Business name: ${lead.business_name}
Category: ${lead.category}
Suburb: ${lead.suburb || 'South Australia'}
Issue: They have ${qualificationDesc}

${portfolioContext}

Return only valid JSON: {"subject": "...", "body": "..."}`;

  try {
    const response = await getClient().messages.create({
      model: config.claudeModel,
      max_tokens: 600,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const text = response.content[0].text.trim();

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON in email generation');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.subject || !parsed.body) {
      throw new Error('Claude response missing subject or body fields');
    }

    logger.debug(`Generated email for ${lead.business_name}: "${parsed.subject}"`);
    return { subject: parsed.subject, body: parsed.body };
  } catch (err) {
    logger.error(`Email generation failed for ${lead.business_name}:`, err.message);
    throw err;
  }
}

module.exports = { generateEmail };
