import type { NextConfig } from "next";

/**
 * Domínio público (ex.: financas.seudominio.com.br). Atrás da Cloudflare, o Next compara a origem
 * do clique com o host que chega ao servidor; se o túnel repassar outro host (ex.: app:3000), os
 * botões de salvar seriam recusados. Lido no build (a VPS passa pelo docker-compose).
 */
const dominios = (process.env.APP_DOMINIO ?? "")
  .split(",")
  .map((d) => d.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Gera um servidor Node enxuto em .next/standalone para rodar no Docker da VPS.
  output: "standalone",
  // O driver do Postgres não deve ser empacotado pelo bundler.
  serverExternalPackages: ["pg"],
  cacheComponents: true,
  ...(dominios.length ? { experimental: { serverActions: { allowedOrigins: dominios } } } : {}),
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
