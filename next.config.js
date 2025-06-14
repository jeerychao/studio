/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone', // Temporarily commented out
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: ['*'], // Corrected to be a JS array
      allowedForwardedHosts: ['*'], 
    },
    allowedDevOrigins: [ // Ensuring these match the latest logs, HTTPS preferred
      'https://6000-firebase-studio-1748502313819.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev',
      'https://9000-firebase-studio-1748502313819.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev',
      // Adding HTTP as a fallback, though less likely for these environments
      'http://6000-firebase-studio-1748502313819.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev',
      'http://9000-firebase-studio-1748502313819.cluster-ikxjzjhlifcwuroomfkjrx437g.cloudworkstations.dev',
    ],
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
