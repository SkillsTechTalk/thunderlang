/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Soft retirement: IntentLang -> ThunderLang. Any request that arrives on the
  // legacy host is permanently redirected to the new canonical domain, preserving
  // the path so deep links keep working (intentlanguage.dev/docs -> thunderlang.dev/docs).
  // NOTE: only effective once thunderlang.dev is registered and serving this site on
  // Vercel; deploying this before that would 301 live traffic to a dead domain.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?intentlanguage\\.dev' }],
        destination: 'https://thunderlang.dev/:path*',
        permanent: true,
      },
    ];
  },
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
};

export default nextConfig;
