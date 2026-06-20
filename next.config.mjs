/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
