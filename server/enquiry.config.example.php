<?php
/*
 * SEMPLO — enquiry endpoint PRIVATE configuration (TEMPLATE).
 *
 * The real file lives OUTSIDE the web root, so the server can never serve it
 * and it is never in this repo:
 *
 *     /home/semplode/semplo-private/enquiry.config.php
 *
 * (public/api/enquiry.php resolves it as __DIR__/../../semplo-private/… from
 * /home/semplode/public_html/api/, so the path above is not optional.)
 *
 * To install: create the directory, copy this file there under the name above,
 * fill in the real values, then `chmod 600` it. NEVER commit the filled copy.
 */
return [
    // Cloudflare Turnstile SECRET key (dash.cloudflare.com → Turnstile → the
    // semplodesign.com widget). The public SITE key is in
    // src/sections.config.js; this is the private half.
    'turnstile_secret' => 'PASTE-THE-TURNSTILE-SECRET-KEY-HERE',

    // Where enquiries land — the studio's mailbox on this hosting account.
    'to' => 'studio@semplodesign.com',

    // The From address. MUST be on a domain hosted in this cPanel account
    // (e.g. enquiry@semplodesign.com) or SuperHosting's Exim will refuse or
    // spam-flag the message. No password needed — delivery is local mail(),
    // not SMTP.
    'from' => 'enquiry@semplodesign.com',
];
