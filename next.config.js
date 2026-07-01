/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow large payloads for training video/PPT uploads handled by server actions.
  experimental: {
    serverActions: {
      bodySizeLimit: "150mb",
    },
  },
};

module.exports = nextConfig;
