/** The public pages. `slug` is both the docs/legal file name and the URL path. */
export const LEGAL_PAGES = [
  { slug: 'about', label: 'About', heading: 'About AIAIA' },
  { slug: 'contact', label: 'Contact', heading: 'Contact Us' },
  { slug: 'privacy', label: 'Privacy', heading: 'Privacy Policy' },
  { slug: 'terms', label: 'Terms', heading: 'Terms of Use' },
  { slug: 'refunds', label: 'Refunds', heading: 'Cancellation & Refund Policy' },
  { slug: 'delivery', label: 'Delivery', heading: 'Service Delivery Policy' },
  { slug: 'pricing', label: 'Pricing', heading: 'Pricing' },
  { slug: 'delete-account', label: 'Delete account', heading: 'Delete Your Account' },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]['slug'];

export const DRAFT_BANNER = 'DRAFT – pending approval';
