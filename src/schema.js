/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — LocalBusiness structured data, built from config.
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  ONE node, `HomeAndConstructionBusiness` (a LocalBusiness subtype), carrying
 *  the contact details AND — once real reviews exist in config — `review` +
 *  `aggregateRating` hung off that same entity, which is what makes the ratings
 *  eligible to surface as a review snippet rather than floating unattached.
 *
 *  main.js writes the result into the [data-ld-business] script tag in
 *  index.html at boot (replacing the static no-JS fallback there). Kept in its
 *  own DOM-free module so the e2e suite can assert the shape directly.
 *
 *  ── WHY PLACEHOLDERS ARE EXCLUDED ───────────────────────────────────────
 *  Entries in `reviews.items` that still carry `todo: true` are demo copy, not
 *  real customer reviews. Publishing invented reviews (or an aggregate score
 *  computed from them) as structured data is a spam-policy violation and can
 *  earn a manual action on the whole site, so:
 *    • only todo-free items become Review nodes;
 *    • if there are NONE, neither `review` nor `aggregateRating` is emitted at
 *      all — the business node ships without them.
 *  Delete the `todo` key from an entry the moment it holds a real review and
 *  both appear on the next load. No other switch to flip.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Reviews that are safe to publish as structured data (real, not placeholder). */
export const publishable = (reviews) =>
  (reviews?.items || []).filter((r) => !r.todo && r.author && (r.textBg || r.textEn))

/**
 * The full JSON-LD node.
 * @param {object} business  the `business` export from sections.config.js
 * @param {object} reviews   the `reviews` export from sections.config.js
 * @param {string} [lang]    'bg' | 'en' — which review text to publish
 */
export function businessLd(business, reviews, lang = 'bg') {
  const b = business
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    // relative @id, resolved against the page URL — so a single node identity
    // works on any deploy domain (Netlify preview, custom domain, localhost)
    '@id': '#business',
    name: b.name,
    description:
      'Интериорно студио — дизайн, сухо строителство, внос на строителни материали и мебели по поръчка.',
    telephone: b.phone,
    email: b.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.street,
      addressLocality: b.city,
      addressCountry: b.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: b.geo.lat, longitude: b.geo.lng },
    hasMap: b.map.link,
    sameAs: b.social.slice(),
  }

  const real = publishable(reviews)
  if (!real.length) return ld // nothing verifiable to publish — see the note above

  ld.aggregateRating = {
    '@type': 'AggregateRating',
    ratingValue: String(reviews.rating),
    reviewCount: String(reviews.count),
    bestRating: '5',
    worstRating: '1',
  }
  ld.review = real.map((r) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: r.author },
    datePublished: r.date,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: String(r.rating),
      bestRating: '5',
      worstRating: '1',
    },
    reviewBody: (lang === 'bg' ? r.textBg : r.textEn) || r.textBg || r.textEn,
    // where the review was originally left — honest provenance, and it is what
    // lets a consumer see these are Google reviews rather than site testimonials
    ...(reviews.url ? { url: reviews.url } : {}),
  }))
  return ld
}
