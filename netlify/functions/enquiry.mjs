/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — enquiry form endpoint (Cloudflare Turnstile → Netlify Forms).
 * ─────────────────────────────────────────────────────────────────────────
 *  POST /.netlify/functions/enquiry   (url-encoded, straight from the dialog)
 *
 *  Netlify Forms can validate its OWN reCAPTCHA but knows nothing about
 *  Turnstile, so the dialog posts here instead of to Netlify's form endpoint.
 *  This function is the enforcement point:
 *
 *    1. HONEYPOT   `bot-field` filled → accept with 200 and discard. A bot is
 *                  told nothing; a 403 would just teach it to retry differently.
 *    2. TURNSTILE  verify `cf-turnstile-response` against Cloudflare with the
 *                  SECRET key. Rejected → 403 { error: 'captcha' }, which the
 *                  dialog turns into a bilingual "security check failed".
 *    3. FORWARD    only then hand the submission to Netlify Forms, so it still
 *                  lands under Site → Forms → contact like any other.
 *
 *  ── FAILS CLOSED ────────────────────────────────────────────────────────
 *  No TURNSTILE_SECRET_KEY in the environment ⇒ 503, nothing is stored. A form
 *  that silently accepted everything because a variable was missing is worse
 *  than one that is visibly broken: the first quietly fills the dashboard with
 *  spam, the second gets noticed and fixed in a minute. SET THE VARIABLE BEFORE
 *  THE FIRST DEPLOY (Netlify → Site configuration → Environment variables →
 *  TURNSTILE_SECRET_KEY, scope: Functions).
 *
 *  ── WHAT THIS CANNOT DO ─────────────────────────────────────────────────
 *  Netlify registers a form by parsing public HTML, so `form-name=contact` is
 *  discoverable and Netlify's own endpoint stays POST-able. A bot that scrapes
 *  the page and submits the action it finds comes here and is blocked; one
 *  written specifically against Netlify Forms could post around this function,
 *  and would then face the honeypot and Netlify's built-in spam filtering.
 *  Sealing that gap means storing submissions here instead of in Netlify Forms.
 * ─────────────────────────────────────────────────────────────────────────
 */
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// Fields we never hand on to Netlify Forms: the token is spent and worthless
// once verified, and the honeypot is an implementation detail.
const STRIP = ['cf-turnstile-response', 'bot-field']

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // never let a CDN or browser cache an enquiry response
      'cache-control': 'no-store',
    },
  })

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
    return json(200, { ok: true }) // look identical to success, store nothing
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

  // ── 3. forward into Netlify Forms ────────────────────────────────────────
  // DEPLOY_PRIME_URL first so a deploy preview's test submissions stay in that
  // preview instead of landing in the production form.
  const site = process.env.DEPLOY_PRIME_URL || process.env.URL
  if (!site) {
    console.error('Neither DEPLOY_PRIME_URL nor URL is set — cannot reach Netlify Forms.')
    return json(500, { error: 'no-site-url' })
  }
  if (!params.get('form-name')) return json(400, { error: 'missing-form-name' })

  for (const k of STRIP) params.delete(k)

  try {
    const res = await fetch(site, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    // Netlify answers a successful form post with 200 or a 303 to the success
    // page; both mean stored. Anything else did not store.
    if (!res.ok && res.status !== 303) {
      console.error('Netlify Forms rejected the forward:', res.status, await res.text())
      return json(502, { error: 'store-failed' })
    }
  } catch (e) {
    console.error('Could not forward to Netlify Forms:', e?.message)
    return json(502, { error: 'store-failed' })
  }

  return json(200, { ok: true })
}
