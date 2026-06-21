import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet is incompatible with React 18 StrictMode's double-invoke in dev
  reactStrictMode: false,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "places.googleapis.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/api/venues",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "nightvibe",
  project: "nightvibe-web",
});
