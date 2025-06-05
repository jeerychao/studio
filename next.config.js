/** @type {import('next').NextConfig} */
const nextConfig = {
  // For Next.js 14.1+, serverActions is a top-level configuration.
  // Ensure there's no conflicting 'experimental.serverActions' if you uncomment this.
  serverActions: {
    allowedOrigins: [
      "http://17.100.100.253:8081", // This is the Origin header from your logs. Assumes HTTP.
      // You might also need "http://localhost:8081" if you access it via localhost port forwarding from Windows
      // or "http://localhost:3010" if your setup somehow makes the origin appear as the Docker host port.
      // It's best to check the browser's request 'Origin' header if issues persist.
    ],
  },
  // If the above doesn't work, and you are on an older Next.js 14 version,
  // you might need to place it under experimental, but this is less likely for 14.2.x
  // experimental: {
  //   serverActions: {
  //     allowedOrigins: ["http://17.100.100.253:8081"],
  //   },
  // },
};

module.exports = nextConfig;
