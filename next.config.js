/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Next.js 14.1+, serverActions is a top-level configuration.
  serverActions: {
    allowedOrigins: [
      "http://17.100.100.253:8081", // From your logs (Origin header)
      "http://17.100.100.253:3010", // From your logs (X-Forwarded-Host)
      "http://localhost:3000",      // For local Next.js dev server access
      "http://localhost:3010",      // For accessing Docker mapped port via localhost
      // If you have a domain, add it here: "https://yourdomain.com"
    ],
  },
  // If the above doesn't work with your Next.js version (older than 14.1),
  // you might need to place it under experimental:
  // experimental: {
  //   serverActions: {
  //     allowedOrigins: [
      // "http://17.100.100.253:8081",
      // "http://17.100.100.253:3010",
      // "http://localhost:3000",
      // "http://localhost:3010"
      // ],
  //   },
  // },
};

module.exports = nextConfig;
