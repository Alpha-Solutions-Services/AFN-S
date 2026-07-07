/** Production + local origins allowed for OAuth redirects. */
export const ALLOWED_SITE_ORIGINS = [
  "http://localhost:3000",
  "https://freightsales.alphasolutions.software",
  "https://afn-s.vercel.app",
] as const;

export type AllowedSiteOrigin = (typeof ALLOWED_SITE_ORIGINS)[number];

export function isAllowedSiteOrigin(origin: string): origin is AllowedSiteOrigin {
  return (ALLOWED_SITE_ORIGINS as readonly string[]).includes(origin);
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

/** Supabase Auth → URL Configuration → Redirect URLs (add all of these). */
export const SUPABASE_REDIRECT_URLS = ALLOWED_SITE_ORIGINS.map(
  (origin) => `${origin}/auth/callback`
);
