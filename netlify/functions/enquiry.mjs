/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — enquiry form endpoint (Cloudflare Turnstile → email via SMTP).
 * ─────────────────────────────────────────────────────────────────────────
 *  POST /.netlify/functions/enquiry   (url-encoded, straight from the dialog)
 *
 *  This function is the enforcement point AND the delivery mechanism:
 *
 *    1. HONEYPOT   `bot-field` filled → accept with 200 and discard. A bot is
 *                  told nothing; a 403 would just teach it to retry differently.
 *    2. TURNSTILE  verify `cf-turnstile-response` against Cloudflare with the
 *                  SECRET key. Rejected → 403 { error: 'captcha' }, which the
 *                  dialog turns into a bilingual "security check failed".
 *    3. EMAIL      only then send the enquiry to the studio's mailbox over
 *                  SuperHosting's SMTP, from the studio's own domain, with
 *                  Reply-To set to the enquirer — the studio just hits Reply.
 *
 *  ── WHY EMAIL, NOT NETLIFY FORMS ────────────────────────────────────────
 *  Netlify Forms' free tier stops STORING at 100 submissions/month — past the
 *  cap an enquiry vanishes with a success response, which is the worst possible
 *  failure during an ad campaign. SuperHosting mail is the client's own,
 *  already paid for, no per-message product cap at enquiry volume, and SPF/DKIM
 *  for the domain already point at it. Losing Netlify Forms also closes the old
 *  gap where a bot could POST straight at Netlify's form endpoint around the
 *  Turnstile check: there is no second endpoint any more.
 *
 *  ── FAILS CLOSED ────────────────────────────────────────────────────────
 *  Missing configuration or an SMTP failure ⇒ 5xx, and the dialog shows the
 *  bilingual "not sent — email us directly" message with the mailto fallback.
 *  A form that answered 200 while delivering nothing would quietly eat leads;
 *  one that is visibly broken gets noticed and fixed in a minute.
 *
 *  ── ENVIRONMENT (Netlify → Site configuration → Environment variables,
 *     scope: Functions — set ALL of these before the first deploy) ────────
 *    TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret (as before)
 *    SMTP_HOST             SuperHosting mail server, e.g. semplodesign.com
 *                          or serverNN.superhosting.bg (cPanel → Email →
 *                          Connect Devices shows the exact hostname)
 *    SMTP_PORT             465 (SSL) — the default if unset; 587 also works
 *    SMTP_USER             full mailbox address, e.g. enquiry@semplodesign.com
 *    SMTP_PASS             that mailbox's password
 *    ENQUIRY_TO            where enquiries land (defaults to SMTP_USER)
 * ─────────────────────────────────────────────────────────────────────────
 */
import nodemailer from 'nodemailer'

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/* The enquiry fields, in presentation order. Labels are Bulgarian because the
 * VALUES always arrive in Bulgarian (the dialog posts BG option values whatever
 * the UI language — one consistent vocabulary in the studio's inbox), and the
 * studio reads Bulgarian. Everything is UTF-8 end to end, so Cyrillic in
 * headers, subject and body is safe (nodemailer RFC-2047-encodes headers). */
const FIELDS = [
  ['name', 'Име'],
  ['email', 'Имейл'],
  ['phone', 'Телефон'],
  ['size-m2', 'Площ (кв.м)'],
  ['project-type', 'Тип проект'],
  ['project-stage', 'Етап'],
  ['timeline', 'Кога'],
  ['budget', 'Бюджет'],
  ['message', 'Съобщение'],
]

// generous server-side cap per field — the form's own maxlength is client-side
const MAX_FIELD = 4000

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // never let a CDN or browser cache an enquiry response
      'cache-control': 'no-store',
    },
  })

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function buildEmail(params) {
  const rows = FIELDS.map(([key, label]) => ({
    label,
    value: (params.get(key) || '').trim().slice(0, MAX_FIELD),
  }))
  const name = rows[0].value || '(без име)'
  const type = params.get('project-type') || ''

  const text = rows
    .filter((r) => r.value)
    .map((r) => `${r.label}:\n${r.value}`)
    .join('\n\n')

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Ново запитване от сайта</h2>
    <table style="border-collapse:collapse;width:100%">
      ${rows
        .filter((r) => r.value)
        .map(
          (r) => `
      <tr>
        <td style="padding:8px 16px 8px 0;vertical-align:top;color:#777;font-size:13px;white-space:nowrap">${esc(r.label)}</td>
        <td style="padding:8px 0;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(r.value)}</td>
      </tr>`
        )
        .join('')}
    </table>
    <p style="margin:20px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;color:#999;font-size:12px">
      Изпратено през формата на semplodesign.com · Отговорете директно на този имейл (Reply-To е клиентът).
    </p>
  </div>`

  return {
    subject: `Ново запитване — ${name}${type ? ` (${type})` : ''}`,
    text,
    html,
    replyToName: name,
    replyToEmail: rows[1].value,
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' })

  let params
  try {
    params = new URLSearchParams(await req.text())
  } catch {
    return json(400, { error: 'bad-body' })
  }

  // ── 1. honeypot — a human cannot fill a clipped, tabindex=-1 input ────────
  if ((params.get('bot-field') || '').trim() !== '') {
    return json(200, { ok: true }) // look identical to success, send nothing
  }

  // ── 2. Turnstile ─────────────────────────────────────────────────────────
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.error(
      'TURNSTILE_SECRET_KEY is not set — refusing every submission. Add it in ' +
        'Netlify → Site configuration → Environment variables (scope: Functions).'
    )
    return json(503, { error: 'captcha-misconfigured' })
  }

  const token = params.get('cf-turnstile-response') || ''
  if (!token) return json(403, { error: 'captcha', reason: 'missing-token' })

  const verifyBody = new URLSearchParams({ secret, response: token })
  // binds the token to the submitting client, so a token cannot be farmed out
  const ip = req.headers.get('x-nf-client-connection-ip')
  if (ip) verifyBody.set('remoteip', ip)

  let verdict
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: verifyBody,
    })
    verdict = await res.json()
  } catch (e) {
    // Cloudflare unreachable. Fail CLOSED, and say so distinctly so a real
    // outage is not mistaken for a visitor failing the challenge.
    console.error('Turnstile siteverify unreachable:', e?.message)
    return json(502, { error: 'captcha-unreachable' })
  }

  if (!verdict?.success) {
    console.warn('Turnstile rejected a submission:', verdict?.['error-codes'])
    return json(403, { error: 'captcha', reason: verdict?.['error-codes'] })
  }

  // ── 3. email the enquiry to the studio ───────────────────────────────────
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ENQUIRY_TO } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error(
      'SMTP is not configured — refusing the submission. Set SMTP_HOST, ' +
        'SMTP_USER, SMTP_PASS (and optionally SMTP_PORT, ENQUIRY_TO) in ' +
        'Netlify → Site configuration → Environment variables (scope: Functions).'
    )
    return json(503, { error: 'email-misconfigured' })
  }

  const mail = buildEmail(params)
  const port = Number(SMTP_PORT) || 465
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades via STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // a cold lambda + a slow handshake must not eat the whole 10s budget
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 8000,
  })

  try {
    await transporter.sendMail({
      // From must be the authenticated mailbox or SuperHosting rejects/spams it
      from: { name: 'SEMPLO — запитване от сайта', address: SMTP_USER },
      to: ENQUIRY_TO || SMTP_USER,
      // the studio hits Reply and talks straight to the enquirer
      ...(mail.replyToEmail
        ? { replyTo: { name: mail.replyToName, address: mail.replyToEmail } }
        : {}),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    })
  } catch (e) {
    console.error('SMTP send failed:', e?.message)
    return json(502, { error: 'send-failed' })
  }

  return json(200, { ok: true })
}

// exported for direct unit-testing of the formatting (not used by Netlify)
export { buildEmail }
