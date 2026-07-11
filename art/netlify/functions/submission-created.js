// Fires automatically whenever a Netlify Form on this site is submitted.
// Sends the notification itself (via Resend) so the email has a real
// Reply-To pointing at the customer, instead of Netlify's own address.
const { getStore } = require('@netlify/blobs');

const RATE_LIMIT_PER_HOUR = 10;

exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || '{}');
    if (!payload || payload.form_name !== 'commission') {
      return { statusCode: 200, body: 'ignored: not the commission form' };
    }

    const data = payload.data || {};

    // Honeypot: a real browser submission always leaves this blank. Netlify's own
    // form-detection already enforces this for genuine form submits, but this function's
    // URL is also directly callable, bypassing that — so re-check it here too.
    if (data['bot-field']) {
      return { statusCode: 200, body: 'ignored: honeypot triggered' };
    }

    const stripNewlines = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
    const name = stripNewlines(data.name) || 'Someone';
    const email = stripNewlines(data.email);
    const interest = data.interest || '';
    const vision = data.vision || '';

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name.trim() || !isValidEmail || !vision.trim()) {
      return { statusCode: 200, body: 'ignored: missing or invalid required fields' };
    }

    // Rate limit: caps how many notification emails (and Resend sends) this function
    // can trigger per hour, since its URL is directly callable and bypasses the real
    // form's honeypot entirely. Not perfectly atomic, but sufficient to stop a flood.
    try {
      const store = getStore('rate-limits');
      const key = `commission-${new Date().toISOString().slice(0, 13)}`;
      const count = (await store.get(key, { type: 'json' })) || 0;
      if (count >= RATE_LIMIT_PER_HOUR) {
        return { statusCode: 200, body: 'ignored: rate limit reached' };
      }
      await store.setJSON(key, count + 1);
    } catch (rateLimitErr) {
      console.error('Rate limit check failed (allowing request through):', rateLimitErr);
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not set — skipping custom notification (Netlify\'s default form email still applies).');
      return { statusCode: 200, body: 'no api key configured' };
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vhictorry Studio <studio@vhictorry.com>',
        to: ['studio@vhictorry.com'],
        reply_to: email || undefined,
        subject: `New commission inquiry from ${name} — art.vhictorry.com`,
        html: `
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Interested in:</strong> ${escapeHtml(interest)}</p>
          <p><strong>Vision:</strong><br>${escapeHtml(vision).replace(/\n/g, '<br>')}</p>
          <hr>
          <p style="color:#888;font-size:12px;">Just hit Reply — it'll go straight to ${escapeHtml(email)}.</p>
        `,
      }),
    });

    if (!res.ok) {
      console.error('Resend API error', res.status, await res.text());
    }

    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('submission-created function error:', err);
    return { statusCode: 200, body: 'error handled' };
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
