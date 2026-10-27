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
    // Velocidad (22 oct): al regresar a una pantalla visitada hace menos de
    // 30 s se muestra al instante lo que ya se tenía, sin pedirlo otra vez.
    // Guardar algo (acciones con revalidatePath) siempre la refresca.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
