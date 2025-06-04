/** @type {import('next').NextConfig} */
const nextConfig = {
  // experimental: {
  //   serverActions: {
  //     // Temporarily commented out to isolate database issues from Server Action origin issues.
  //     // If Server Action origin errors persist after DB fix, this might need adjustment
  //     // based on how you access the app through WSL (e.g., localhost, WSL IP).
  //     // allowedOrigins: [
  //     //   "17.100.100.253:8081",
  //     //   "17.100.100.253:3010",
  //     //   "localhost:3010", // Common for local access
  //     // ],
  //   },
  // },
  // For newer Next.js versions, serverActions might be top-level:
  // serverActions: {
  //   allowedOrigins: ["17.100.100.253:8081", "17.100.100.253:3010", "localhost:3010"],
  // },
};

module.exports = nextConfig;
