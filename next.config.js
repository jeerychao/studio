
/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone', // Temporarily commented out
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: ['*'], // Corrected to be a JS array
      allowedForwardedHosts: ['*'], // Corrected to be a JS array
    },
    // Removed 'allowedDevOrigins' as it's not recognized for Next.js 14.2.3
    // We might need to tolerate the cross-origin warnings from Firebase Studio for now
    // if there isn't a direct equivalent for this Next.js version.
  },
  headers: async () => {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Forwarded-Host, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
