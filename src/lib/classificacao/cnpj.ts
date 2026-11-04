import { inArray } from "drizzle-orm";
import type { Db } from "../db";
import { empresas } from "../db/schema";

/**
 * Consulta pública de CNPJ (BrasilAPI, gratuita, sem chave), com cache na tabela `empresas`.
 * Só CNPJ (dado público de empresa): CPF nunca é consultado. Nada é enviado à IA.
 * Desligue com CONSULTA_CNPJ=0. Nos testes fica desligada, a menos que CONSULTA_CNPJ=1.
 */
const urlBase = () => process.env.CNPJ_API_URL ?? "https://brasilapi.com.br/api/cnpj/v1";
/** Por rodada de classificação: a BrasilAPI é gratuita, então pegamos leve. */
const MAXIMO_POR_RODADA = 25;
const TENTAR_DE_NOVO_APOS_MS = 24 * 3600 * 1000;

export function consultaCnpjLigada(): boolean {
  const v = process.env.CONSULTA_CNPJ;
  if (v === "0") return false;
  if (process.env.VITEST && v !== "1") return false;
  return true;
}

export interface DadosEmpresa {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
}

async function buscar(cnpj: string, signal?: AbortSignal): Promise<{ situacao: "ok" | "nao_encontrado" | "erro"; dados?: Omit<DadosEmpresa, "cnpj"> }> {
  try {
    const tempo = AbortSignal.timeout(8000);
    const resposta = await fetch(`${urlBase()}/${cnpj}`, {
      headers: { "User-Agent": "app-financeiro (uso pessoal)", Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, tempo]) : tempo,
    });
    if (resposta.status === 404 || resposta.status === 400) return { situacao: "nao_encontrado" };
    if (!resposta.ok) return { situacao: "erro" };
    const j = (await resposta.json()) as { razao_social?: string; nome_fantasia?: string; cnae_fiscal?: number | string; cnae_fiscal_descricao?: string };
    return {
      situacao: "ok",
      dados: {
        razaoSocial: j.razao_social ?? null,
        nomeFantasia: j.nome_fantasia || null,
        cnae: j.cnae_fiscal ? String(j.cnae_fiscal).padStart(7, "0") : null,
        cnaeDescricao: j.cnae_fiscal_descricao ?? null,
      },
    };
  } catch (erro) {
    if (signal?.aborted) throw erro;
    return { situacao: "erro" };
  }
}

/** Dados das empresas pelo CNPJ: o que está no cache e, se ligado, consulta o que falta. */
export async function dadosDasEmpresas(db: Db, cnpjs: string[], signal?: AbortSignal): Promise<Map<string, DadosEmpresa>> {
  const unicos = [...new Set(cnpjs.filter((c) => /^\d{14}$/.test(c)))];
  const mapa = new Map<string, DadosEmpresa>();
  if (unicos.length === 0) return mapa;
  const cache = await db.select().from(empresas).where(inArray(empresas.cnpj, unicos));
  const agora = Date.now();
  const faltando: string[] = [];
  for (const cnpj of unicos) {
    const c = cache.find((x) => x.cnpj === cnpj);
    if (c?.situacao === "ok") mapa.set(cnpj, c);
    else if (!c || (c.situacao === "erro" && agora - c.consultadoEm.getTime() > TENTAR_DE_NOVO_APOS_MS)) faltando.push(cnpj);
  }
  if (!consultaCnpjLigada()) return mapa;
  for (const cnpj of faltando.slice(0, MAXIMO_POR_RODADA)) {
    const r = await buscar(cnpj, signal);
    const linha = { cnpj, situacao: r.situacao, consultadoEm: new Date(), razaoSocial: null, nomeFantasia: null, cnae: null, cnaeDescricao: null, ...r.dados };
    await db.insert(empresas).values(linha).onConflictDoUpdate({ target: empresas.cnpj, set: linha });
    if (r.situacao === "ok") mapa.set(cnpj, linha);
  }
  return mapa;
}
