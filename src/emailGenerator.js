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
  outdated: 'a website that looks like it hasn\'t been updated since before 2023',
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

  const systemPrompt = `You are writing cold outreach emails on behalf of Alex — a web developer and local business guy based in Adelaide, South Australia. The current year is ${currentYear}.

ALEX'S ACTUAL VOICE (based on real emails he has sent):
- Opens with "Hey [name]" or "Hey team" or "Hey mate" or "Hey fellas" — never formal
- Introduces himself early: "Alex here" — casual, not a pitch
- Leads with a personal connection, local angle, or genuine observation — not with the problem
- Warm and genuine — he actually cares about local businesses doing good work
- Self-deprecating humour: "I got a bit carried away", "I won't cry", "nerding out over a nice clean layout"
- Natural phrases: "keen", "stickybeak", "no stress", "pop round", "chop and change", "keen to get the ball rolling"
- Does NOT use forced Aussie slang like "reckon", "chuck", "crikey" — that sounds fake
- Writes as long as the email needs to be — sometimes short, sometimes with a bullet list of what he built
- Bullet points only when listing specific features of the concept he built (3-4 max, short and punchy)
- Never sounds salesy, desperate, or like a template
- Signs off as just "Alex" or "Alex :)" — he introduces himself at the top, not the bottom

REAL EXAMPLES OF HIS OPENING LINES:
- "Alex here, I'm one of Riley's customers (now mates) at RJM."
- "My name is Alex, I run a studio on Paringa Avenue around the corner from your workshop."
- "Saw you at the Brighton Metro yesterday. Noticed you didn't have a website and I had some time to build a free concept for you!"
- "Alex here — I'm a local web + AI guy in Adelaide."

EMAIL STRUCTURE:
1. Greeting: Hey [name/team/mate/fellas]
2. Who Alex is: brief intro with local/personal connection — keep it real, not a pitch
3. Credibility: if a portfolio project is provided, name it explicitly with the URL — e.g. "I built the site for RJM Performance at rjmperformance.com.au" — never vague
4. The concept: Alex has already put together a free homepage concept for them — it's done, no strings — offer the link as a placeholder [CONCEPT_LINK] so it can be swapped in
5. Optional bullet points: if the email is longer, 3-4 short bullets on what he focused on in the concept
6. Soft CTA: just ask what they think, or if they're keen to chat — low pressure, one question
7. Sign-off: just "Alex" or "Alex :)"

SUBJECT LINE STYLE:
- Short, honest, conversational — reads like a message from someone they almost know
- Not clickbaity, not marketing-speak
- Examples of his style: "Free concept for [Business Name]", "I built something for you, [Business Name]", "Quick one for the [Business Name] team", "Had some time and built this for you"
- Never use "Oi" — too forced

Return your response as JSON with this exact shape:
{"subject": "...", "body": "..."}

The body should use paragraphs separated by blank lines. No HTML tags. Bullet points as plain "- item" lines.`;

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
      max_tokens: 900,
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
