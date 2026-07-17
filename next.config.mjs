/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    // Consolidate every legacy / alternate host onto the canonical thunderlang.dev.
    // intentlanguage.dev is the retired IntentLang domain — kept as a permanent
    // redirect so old links, packages, and search traffic land on ThunderLang.
    // (All hosts point at this same Vercel project; DNS is managed on GoDaddy.)
    const toCanonical = (host) => ({
      source: "/:path*",
      has: [{ type: "host", value: host }],
      destination: "https://thunderlang.dev/:path*",
      permanent: true,
    });
    return [
      toCanonical("thunderlang.com"),
      toCanonical("www.thunderlang.com"),
      toCanonical("www.thunderlang.dev"),
      toCanonical("intentlanguage.dev"),
      toCanonical("www.intentlanguage.dev"),
    ];
  },
};

export default nextConfig;
