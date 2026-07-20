import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Imagens de perguntas enviadas pelo painel /questions ficam no Supabase
    // Storage (URL pública <projeto>.supabase.co). next/image só otimiza hosts
    // remotos declarados aqui.
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
