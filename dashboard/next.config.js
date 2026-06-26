/** @type {import('next').NextConfig} */

// Build-time env kontrolu: BACKEND_URL veya NEXT_PUBLIC_BACKEND_URL'den
// en az biri tanimli olmali. Production build'inde eksiklik buyuk hatadir.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const hasBackend =
  Boolean(process.env.BACKEND_URL) || Boolean(process.env.NEXT_PUBLIC_BACKEND_URL);
if (isBuild && !hasBackend) {
  throw new Error(
    "BACKEND_URL (veya NEXT_PUBLIC_BACKEND_URL) tanimli degil — production build durduruldu.",
  );
}

const nextConfig = {
  reactStrictMode: true,
  // Vercel + Docker icin optimize edilmis standalone cikti
  output: "standalone",
  async rewrites() {
    const backend = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backend) return [];
    return [
      {
        source: "/api/backend/:path*",
        destination: `${backend}/api/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/rezervasyon", destination: "/", permanent: true },
    ];
  },
};

module.exports = nextConfig;
