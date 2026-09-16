/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // required for static export
  },
  // The API base URL is read from NEXT_PUBLIC_API_URL at build time (see lib/api.js).
};

module.exports = nextConfig;
