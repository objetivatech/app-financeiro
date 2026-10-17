import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node enxuto em .next/standalone para rodar no Docker da VPS.
  output: "standalone",
  // O driver do Postgres não deve ser empacotado pelo bundler.
  serverExternalPackages: ["pg"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
