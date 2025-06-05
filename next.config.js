/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Next.js 14.1+, serverActions is a top-level configuration.
  // Ensure there's no conflicting 'experimental.serverActions' if you uncomment this.
  serverActions: {
    allowedOrigins: [
      "http://17.100.100.253:8081", // From your logs (Origin header). Adjust if your access URL/protocol changes.
      // If accessing via localhost through WSL port forwarding, you might also need:
      // "http://localhost:8081",
      // "http://localhost:3010", // This was the X-Forwarded-Host, less likely to be the actual Origin.
    ],
  },
  // If the above doesn't work with your Next.js version (older than 14.1),
  // you might need to place it under experimental:
  // experimental: {
  //   serverActions: {
  //     allowedOrigins: ["http://17.100.100.253:8081"],
  //   },
  // },
};

module.exports = nextConfig;
