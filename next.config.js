/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Every uploaded photo (business logos, instructor bios, product
    // photos, swing sketches) goes through Vercel Blob, which serves each
    // from a random per-store subdomain - the wildcard covers all of them
    // without needing to hardcode one project's exact hostname.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

module.exports = nextConfig;
