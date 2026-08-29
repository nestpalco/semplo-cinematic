<?php
/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — enquiry form endpoint (Cloudflare Turnstile → email via mail()).
 * ─────────────────────────────────────────────────────────────────────────
 *  POST /api/enquiry.php   (url-encoded, straight from the dialog)
 *
 *  SuperHosting/cPanel FALLBACK twin of the live Vercel function
 *  (api/enquiry.js): same gates, same JSON contract, same email. Keep the two
 *  in step. This script is the enforcement point AND the delivery mechanism:
 *
 *    1. HONEYPOT   `bot-field` filled → accept with 200 and discard. A bot is
 *                  told nothing; a 403 would just teach it to retry differently.
 *    2. TURNSTILE  verify `cf-turnstile-response` against Cloudflare with the
 *                  SECRET key. Rejected → 403 { error: 'captcha' }, which the
 *                  dialog turns into a bilingual "security check failed".
 *    3. EMAIL      only then hand the enquiry to THIS SERVER's own mail system
 *                  with PHP mail(), addressed to the studio's mailbox, with
 *                  Reply-To set to the enquirer — the studio just hits Reply.
 *
 *  ── WHY mail(), NOT SMTP ────────────────────────────────────────────────
 *  This script runs on the SAME SuperHosting server that hosts the studio's
 *  mailbox. mail() hands the message to the local Exim, which delivers it into
 *  that mailbox without ever crossing the network — no SMTP handshake to time
 *  out, no SPF/DKIM path to misalign, and (decisively) NO MAILBOX PASSWORD
 *  stored anywhere on disk. An SMTP client here would loop out and back to
 *  this very machine, slower, with a credential to protect and a PHPMailer
 *  vendor tree to keep patched. If ENQUIRY_TO is ever pointed at an OFF-SERVER
 *  address (e.g. a Gmail), revisit this: authenticated SMTP submission then
 *  becomes the deliverability-correct choice.
 *
 *  ── FAILS CLOSED ────────────────────────────────────────────────────────
 *  Missing configuration or a refused mail() ⇒ 5xx, and the dialog shows the
 *  bilingual "not sent — email us directly" message with the mailto fallback.
 *  A form that answered 200 while delivering nothing would quietly eat leads;
 *  one that is visibly broken gets noticed and fixed in a minute.
 *
 *  ── CONFIGURATION — OUTSIDE public_html, never in the repo ──────────────
 *  Secrets live in /home/<account>/semplo-private/enquiry.config.php — one
 *  directory level ABOVE public_html, so the web server can never serve it.
 *  Template: server/enquiry.config.example.php in the repo. It returns:
 *
 *    turnstile_secret   Cloudflare Turnstile SECRET key
 *    to                 where enquiries land (the studio's mailbox)
 *    from               the From address — MUST be on a domain hosted in this
 *                       cPanel account (e.g. enquiry@semplodesign.com) or
 *                       SuperHosting's Exim will refuse/spam-flag it
 * ─────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);
mb_internal_encoding('UTF-8');

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// public_html/api/enquiry.php → up two levels = the account's home directory
const CONFIG_PATH = __DIR__ . '/../../semplo-private/enquiry.config.php';

/* The enquiry fields, in presentation order. Labels are Bulgarian because the
 * VALUES always arrive in Bulgarian (the dialog posts BG option values whatever
 * the UI language — one consistent vocabulary in the studio's inbox), and the
 * studio reads Bulgarian. Everything is UTF-8 end to end: headers and subject
 * are RFC-2047 encoded, the body is base64, so Cyrillic is safe throughout. */
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
];

// generous server-side cap per field — the form's own maxlength is client-side
const MAX_FIELD = 4000;

function respond(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // never let a CDN or browser cache an enquiry response
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function esc(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

// header values are attacker-influenced (name, email) — a CR/LF here would be
// header injection, so strip line breaks before anything reaches a header
function headerSafe(string $s): string
{
    return trim(str_replace(["\r", "\n"], ' ', $s));
}

/** @return array{subject:string,text:string,html:string,replyToName:string,replyToEmail:string} */
function buildEmail(array $post): array
{
    $rows = [];
    foreach (FIELDS as [$key, $label]) {
        $rows[] = ['label' => $label, 'value' => mb_substr(trim((string)($post[$key] ?? '')), 0, MAX_FIELD)];
    }
    $name = $rows[0]['value'] !== '' ? $rows[0]['value'] : '(без име)';
    $type = trim((string)($post['project-type'] ?? ''));

    $filled = array_values(array_filter($rows, fn($r) => $r['value'] !== ''));

    $text = implode("\n\n", array_map(fn($r) => "{$r['label']}:\n{$r['value']}", $filled));

    $trs = implode('', array_map(
        fn($r) => "\n      <tr>\n" .
            '        <td style="padding:8px 16px 8px 0;vertical-align:top;color:#777;font-size:13px;white-space:nowrap">' . esc($r['label']) . "</td>\n" .
            '        <td style="padding:8px 0;font-size:14px;line-height:1.5;white-space:pre-wrap">' . esc($r['value']) . "</td>\n" .
            '      </tr>',
        $filled
    ));

    $html = '
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="font-size:18px;font-weight:600;margin:0 0 16px">Ново запитване от сайта</h2>
    <table style="border-collapse:collapse;width:100%">' . $trs . '
    </table>
    <p style="margin:20px 0 0;padding-top:12px;border-top:1px solid #e5e5e5;color:#999;font-size:12px">
      Изпратено през формата на semplodesign.com · Отговорете директно на този имейл (Reply-To е клиентът).
    </p>
  </div>';

    return [
        'subject'      => 'Ново запитване — ' . $name . ($type !== '' ? " ({$type})" : ''),
        'text'         => $text,
        'html'         => $html,
        'replyToName'  => $name,
        'replyToEmail' => $rows[1]['value'],
    ];
}

/* ── request gate ─────────────────────────────────────────────────────────── */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['error' => 'method-not-allowed']);
}

// PHP has already parsed the url-encoded body into $_POST
$post = $_POST;

/* ── 1. honeypot — a human cannot fill a clipped, tabindex=-1 input ───────── */
if (trim((string)($post['bot-field'] ?? '')) !== '') {
    respond(200, ['ok' => true]); // look identical to success, send nothing
}

/* ── 2. Turnstile ─────────────────────────────────────────────────────────── */
$config = is_file(CONFIG_PATH) ? (require CONFIG_PATH) : null;
$secret = is_array($config) ? (string)($config['turnstile_secret'] ?? '') : '';
if ($secret === '') {
    error_log(
        'enquiry.php: turnstile_secret is not set — refusing every submission. ' .
        'Create ' . CONFIG_PATH . ' from server/enquiry.config.example.php.'
    );
    respond(503, ['error' => 'captcha-misconfigured']);
}

$token = (string)($post['cf-turnstile-response'] ?? '');
if ($token === '') {
    respond(403, ['error' => 'captcha', 'reason' => 'missing-token']);
}

$verifyBody = ['secret' => $secret, 'response' => $token];
// binds the token to the submitting client, so a token cannot be farmed out
if (!empty($_SERVER['REMOTE_ADDR'])) {
    $verifyBody['remoteip'] = $_SERVER['REMOTE_ADDR'];
}

$ch = curl_init(SITEVERIFY);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query($verifyBody),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_TIMEOUT        => 8,
]);
$raw = curl_exec($ch);
$curlErr = curl_error($ch);
curl_close($ch);

$verdict = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($verdict)) {
    // Cloudflare unreachable. Fail CLOSED, and say so distinctly so a real
    // outage is not mistaken for a visitor failing the challenge.
    error_log('enquiry.php: Turnstile siteverify unreachable: ' . ($curlErr ?: 'bad response'));
    respond(502, ['error' => 'captcha-unreachable']);
}

if (empty($verdict['success'])) {
    error_log('enquiry.php: Turnstile rejected a submission: ' . json_encode($verdict['error-codes'] ?? null));
    respond(403, ['error' => 'captcha', 'reason' => $verdict['error-codes'] ?? null]);
}

/* ── 3. email the enquiry to the studio ───────────────────────────────────── */
$to   = filter_var((string)($config['to'] ?? ''), FILTER_VALIDATE_EMAIL);
$from = filter_var((string)($config['from'] ?? ''), FILTER_VALIDATE_EMAIL);
if (!$to || !$from) {
    error_log(
        'enquiry.php: mail is not configured — refusing the submission. Set valid ' .
        '`to` and `from` addresses in ' . CONFIG_PATH . '.'
    );
    respond(503, ['error' => 'email-misconfigured']);
}

$mail = buildEmail($post);

$subject = mb_encode_mimeheader($mail['subject'], 'UTF-8', 'B', "\r\n");

$boundary = 'semplo-' . bin2hex(random_bytes(12));
// base64 both parts: line-length-safe and Cyrillic-safe through any relay
$body =
    "--{$boundary}\r\n" .
    "Content-Type: text/plain; charset=utf-8\r\n" .
    "Content-Transfer-Encoding: base64\r\n\r\n" .
    chunk_split(base64_encode($mail['text'])) . "\r\n" .
    "--{$boundary}\r\n" .
    "Content-Type: text/html; charset=utf-8\r\n" .
    "Content-Transfer-Encoding: base64\r\n\r\n" .
    chunk_split(base64_encode($mail['html'])) . "\r\n" .
    "--{$boundary}--\r\n";

$headers = [
    // From must be on a domain of this account or Exim refuses/spam-flags it
    'From: ' . mb_encode_mimeheader('SEMPLO — запитване от сайта', 'UTF-8', 'B') . " <{$from}>",
    'MIME-Version: 1.0',
    "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
];
// the studio hits Reply and talks straight to the enquirer
$replyTo = filter_var(headerSafe($mail['replyToEmail']), FILTER_VALIDATE_EMAIL);
if ($replyTo) {
    $headers[] = 'Reply-To: '
        . mb_encode_mimeheader(headerSafe($mail['replyToName']), 'UTF-8', 'B')
        . " <{$replyTo}>";
}

// -f aligns the envelope sender (Return-Path) with From; $from is validated
// above, so it is shell-safe for sendmail's additional_params
$sent = mail($to, $subject, $body, implode("\r\n", $headers), '-f' . $from);

if (!$sent) {
    error_log('enquiry.php: mail() refused the message');
    respond(502, ['error' => 'send-failed']);
}

respond(200, ['ok' => true]);
