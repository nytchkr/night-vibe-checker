import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet is incompatible with React 18 StrictMode's double-invoke in dev
  reactStrictMode: false,
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  },
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
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "accounts.google.com",
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
      {
        source: "/widget/:path*",
        has: [
          {
            type: "query",
            key: "embed",
            value: "1",
          },
        ],
        headers: [
          {
            key: "X-Frame-Options",
            value: "ALLOWALL",
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
