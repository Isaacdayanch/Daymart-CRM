import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sytynlembvdqsddvatcg.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      // Las fotos de celular suelen pesar varios MB; el límite por
      // defecto (1 MB) las rechazaba con un error genérico.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
