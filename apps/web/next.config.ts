import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @toc/core e @toc/db exportam TypeScript cru (sem build); o Next precisa transpilá-los.
  // @toc/db é usado no runtime Node (traces via DbStore); nunca no middleware edge.
  transpilePackages: ["@toc/core", "@toc/db"],
  // `pg` é nativo do Node — não empacotar no bundle do servidor.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
