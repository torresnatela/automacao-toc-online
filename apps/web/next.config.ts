import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @toc/core exporta TypeScript cru (sem build); o Next precisa transpilá-lo.
  transpilePackages: ["@toc/core"],
};

export default nextConfig;
