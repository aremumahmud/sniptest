/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Base URL of the Snip API (server-side calls use this).
    SNIP_API_URL: process.env.SNIP_API_URL || 'http://localhost:3001',
  },
};

module.exports = nextConfig;
