// Fires automatically whenever a Netlify Form on this site is submitted.
// Sends the notification itself (via Resend) so the email has a real
// Reply-To pointing at the customer, instead of Netlify's own address.
exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || '{}');
    if (!payload || payload.form_name !== 'contact') {
      return { statusCode: 200, body: 'ignored: not the contact form' };
    }

    const data = payload.data || {};
    const name = data.name || 'Someone';
    const email = data.email || '';
    const interest = data.interest || '';
    const message = data.message || '';

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
        from: 'Vhictorry <hello@vhictorry.com>',
        to: ['hello@vhictorry.com'],
        reply_to: email || undefined,
        subject: `New contact message from ${name} — vhictorry.com`,
        html: `
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          ${interest ? `<p><strong>Interested in:</strong> ${escapeHtml(interest)}</p>` : ''}
          <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
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
