/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
  },
  webpack: (config) => {
    // Konva ships a Node.js build that tries to require('canvas') for
    // server-side rendering. We only ever render the drawing canvas in the
    // browser (DrawingCanvas.tsx is a "use client" component), so this
    // native dependency is never actually needed — tell webpack to treat
    // any require('canvas') as an empty module instead of trying to
    // resolve/install the native package.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

module.exports = nextConfig;
