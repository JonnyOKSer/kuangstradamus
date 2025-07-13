/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true, // ✅ disables Image Optimization (required for static export)
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*', // backend API URL
      },
    ];
  },
};

module.exports = nextConfig;
