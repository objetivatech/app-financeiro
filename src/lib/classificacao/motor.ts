import type { Natureza } from "../db/schema";
import type { Escopo, TipoConta } from "../importacao/tipos";

/**
 * Motor de classificação determinístico (sem IA). Funciona sobre objetos em memória
 * para ser fácil de testar; a persistência fica em executar.ts.
 *
 * Ordem de prioridade: usuário > regra > transferência > heurística > IA > conta.
 * (O escopo da conta é só um palpite inicial: a IA pode discordar, e é aí que detectamos mistura.)
 * Uma etapa nunca sobrescreve o que uma etapa de prioridade maior já decidiu.
 */

export type Origem = "usuario" | "regra" | "transferencia" | "heuristica" | "conta" | "ia";

const PRIORIDADE: Record<Origem, number> = { usuario: 6, regra: 5, transferencia: 4, heuristica: 3, ia: 2, conta: 1 };

export interface ContaContexto {
  id: number;
  tipo: TipoConta;
  escopoPadrao: Escopo | "misto";
}

export interface TransacaoClassificavel {
  id: number;
  contaId: number;
  data: string;
  descricaoNormalizada: string;
  valorCentavos: number;
  documentoContraparte: string | null;
  /** Nome da contraparte já normalizado (quando o extrato separa). */
  nomeContraparteNormalizado?: string | null;
  escopo: Escopo | null;
  categoriaId: string | null;
  natureza: Natureza;
  classificadoPor: Origem | null;
  parTransferenciaId: number | null;
  revisar: boolean;
  motivo: string | null;
  confianca: number | null;
}

export interface RegraContexto {
  padrao: string;
  contaId: number | null;
  escopo: Escopo | null;
  categoriaId: string | null;
  natureza: Natureza | null;
}

interface Decisao {
  escopo?: Escopo | null;
  categoriaId?: string | null;
  natureza?: Natureza;
  revisar?: boolean;
  motivo?: string;
  confianca?: number;
}

/** Aplica uma decisão respeitando a prioridade da origem. Retorna true se mudou algo. */
export function aplicar(t: TransacaoClassificavel, origem: Origem, d: Decisao): boolean {
  const atual = t.classificadoPor ? PRIORIDADE[t.classificadoPor] : 0;
  if (PRIORIDADE[origem] < atual) return false;
  if (d.escopo !== undefined) t.escopo = d.escopo;
  if (d.categoriaId !== undefined) t.categoriaId = d.categoriaId;
  if (d.natureza !== undefined) t.natureza = d.natureza;
  if (d.revisar !== undefined) t.revisar = d.revisar;
  if (d.motivo !== undefined) t.motivo = d.motivo;
  t.confianca = d.confianca ?? (origem === "ia" ? t.confianca : 1);
  t.classificadoPor = origem;
  return true;
}

export function aplicarEscopoDaConta(t: TransacaoClassificavel, conta: ContaContexto): void {
  if (conta.escopoPadrao === "misto" || t.escopo) return;
  aplicar(t, "conta", { escopo: conta.escopoPadrao, motivo: `Conta marcada como ${conta.escopoPadrao}` });
}

export function aplicarRegras(t: TransacaoClassificavel, regras: RegraContexto[]): boolean {
  // Regra mais específica primeiro: as da própria conta e as de padrão mais longo.
  const candidatas = regras
    .filter((r) => (r.contaId === null || r.contaId === t.contaId) && t.descricaoNormalizada.includes(r.padrao))
    .sort((a, b) => Number(b.contaId !== null) - Number(a.contaId !== null) || b.padrao.length - a.padrao.length);
  const r = candidatas[0];
  if (!r) return false;
  return aplicar(t, "regra", {
    ...(r.escopo ? { escopo: r.escopo } : {}),
    ...(r.categoriaId ? { categoriaId: r.categoriaId } : {}),
    ...(r.natureza ? { natureza: r.natureza } : {}),
    revisar: false,
    motivo: `Regra: descrição contém "${r.padrao}"`,
  });
}

const HEURISTICAS: { teste: RegExp; sinal?: "entrada" | "saida"; apenasCartao?: boolean; decisao: Decisao }[] = [
  {
    // Lado do cartão: o crédito do pagamento da fatura.
    teste: /PAGAMENTO RECEBIDO|PAGAMENTO EFETUADO|PAGTO RECEBIDO|PAGAMENTO DA FATURA|PAGAMENTO FATURA/,
    sinal: "entrada",
    apenasCartao: true,
    decisao: { natureza: "pagamento_fatura", categoriaId: "mov_fatura", motivo: "Pagamento da fatura recebido no cartão" },
  },
  {
    teste: /PAGAMENTO (DE )?FATURA|PGTO FATURA|PAG FATURA|PAGTO CARTAO|PAGAMENTO CARTAO/,
    sinal: "saida",
    decisao: { natureza: "pagamento_fatura", categoriaId: "mov_fatura", motivo: "Pagamento de fatura de cartão" },
  },
  {
    teste: /^DAS\b|\b(PAGAMENTO|PGTO|PAG|GUIA) DAS\b|\bDAS (SIMPLES|MEI)\b|SIMPLES NACIONAL|DOCUMENTO DE ARRECADACAO DO SIMPLES/,
    sinal: "saida",
    decisao: { natureza: "imposto", categoriaId: "pj_impostos", escopo: "PJ", motivo: "Guia do Simples Nacional (DAS)" },
  },
  {
    teste: /PRO ?LABORE/,
    decisao: { natureza: "pro_labore", categoriaId: "mov_socio", motivo: "Descrição cita pró-labore" },
  },
  {
    teste: /DISTRIBUICAO (DE )?LUCROS?|DIVIDENDOS? SOCIO/,
    decisao: { natureza: "distribuicao_lucros", categoriaId: "mov_socio", motivo: "Descrição cita distribuição de lucros" },
  },
  {
    teste: /\bAPLICACAO\b|\bRESGATE\b|\bCDB\b|TESOURO DIRETO|COFRINHO|CAIXINHA|RENDE FACIL|INVEST(IMENTO)? AUTOMATICO/,
    decisao: { natureza: "investimento", categoriaId: "mov_investimento", motivo: "Aplicação ou resgate de investimento" },
  },
  {
    teste: /ESTORNO|REEMBOLSO|DEVOLUCAO|CHARGEBACK/,
    sinal: "entrada",
    decisao: { natureza: "estorno", motivo: "Estorno/devolução" },
  },
];

export function aplicarHeuristicas(t: TransacaoClassificavel, conta: ContaContexto): boolean {
  for (const h of HEURISTICAS) {
    if (h.apenasCartao && conta.tipo !== "cartao_credito") continue;
    if (h.sinal === "entrada" && t.valorCentavos <= 0) continue;
    if (h.sinal === "saida" && t.valorCentavos >= 0) continue;
    if (h.teste.test(t.descricaoNormalizada)) return aplicar(t, "heuristica", { ...h.decisao, revisar: false });
  }
  return false;
}

const INDICIO_TRANSFERENCIA = /\b(PIX|TED|DOC|TEF|TRANSF\w*|ENVIAD[OA]|RECEBID[OA]|DEPOSITO)\b/;
const JANELA_DIAS = 3;

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/**
 * Encontra transferências entre contas do próprio usuário: mesmo valor com sinais opostos,
 * em contas diferentes, até 3 dias de diferença, e algum indício (descrição de Pix/TED
 * ou CPF/CNPJ da contraparte igual a um documento do usuário).
 * Define a natureza conforme o escopo das contas (PJ→PF = retirada do sócio, PF→PJ = aporte).
 */
export function parearTransferencias(
  transacoes: TransacaoClassificavel[],
  contas: Map<number, ContaContexto>,
  documentosDoUsuario: Set<string>,
): number {
  const temIndicio = (t: TransacaoClassificavel) =>
    INDICIO_TRANSFERENCIA.test(t.descricaoNormalizada) ||
    (t.documentoContraparte !== null && documentosDoUsuario.has(t.documentoContraparte));

  const entradas = transacoes.filter((t) => t.valorCentavos > 0 && t.parTransferenciaId === null);
  let pares = 0;
  for (const saida of transacoes) {
    if (saida.valorCentavos >= 0 || saida.parTransferenciaId !== null) continue;
    const candidatos = entradas
      .filter(
        (e) =>
          e.parTransferenciaId === null &&
          e.contaId !== saida.contaId &&
          e.valorCentavos === -saida.valorCentavos &&
          diasEntre(e.data, saida.data) <= JANELA_DIAS &&
          (temIndicio(saida) || temIndicio(e)),
      )
      .sort((a, b) => diasEntre(a.data, saida.data) - diasEntre(b.data, saida.data));
    const entrada = candidatos[0];
    if (!entrada) continue;

    const origem = contas.get(saida.contaId);
    const destino = contas.get(entrada.contaId);
    if (!origem || !destino) continue;

    saida.parTransferenciaId = entrada.id;
    entrada.parTransferenciaId = saida.id;
    pares++;

    let natureza: Natureza = "transferencia_interna";
    let categoriaId = "mov_transferencia";
    let motivo = "Transferência entre contas próprias";
    let revisar = false;
    if (destino.tipo === "cartao_credito") {
      natureza = "pagamento_fatura";
      categoriaId = "mov_fatura";
      motivo = "Pagamento de fatura com conta própria";
    } else if (origem.escopoPadrao === "PJ" && destino.escopoPadrao === "PF") {
      // Pró-labore e distribuição de lucros têm tratamento tributário diferente: o usuário confirma.
      const jaSabe = saida.natureza === "pro_labore" || saida.natureza === "distribuicao_lucros";
      natureza = jaSabe ? saida.natureza : "retirada_socio";
      categoriaId = "mov_socio";
      motivo = "Dinheiro saiu da empresa para a conta pessoal";
      revisar = !jaSabe;
    } else if (origem.escopoPadrao === "PF" && destino.escopoPadrao === "PJ") {
      natureza = "aporte_socio";
      categoriaId = "mov_socio";
      motivo = "Dinheiro pessoal colocado na empresa";
    } else if (origem.escopoPadrao === "misto" || destino.escopoPadrao === "misto") {
      motivo = "Transferência entre contas próprias (conta mista: confirme se envolve a empresa)";
      revisar = true;
    }

    for (const [t, conta] of [
      [saida, origem],
      [entrada, destino],
    ] as const) {
      aplicar(t, "transferencia", {
        natureza,
        categoriaId,
        motivo,
        revisar,
        escopo: conta.escopoPadrao === "misto" ? t.escopo : conta.escopoPadrao,
      });
    }
  }
  return pares;
}

/** Ajusta a natureza quando o gasto é de um escopo e a conta é de outro (o "misturar contas"). */
export function marcarMistura(t: TransacaoClassificavel, conta: ContaContexto): void {
  if (t.natureza !== "comum" || !t.escopo || conta.escopoPadrao === "misto" || t.valorCentavos >= 0) return;
  if (conta.escopoPadrao === "PJ" && t.escopo === "PF") {
    t.natureza = "despesa_pessoal_na_pj";
    t.revisar = true;
  } else if (conta.escopoPadrao === "PF" && t.escopo === "PJ") {
    t.natureza = "despesa_pj_na_pf";
    t.revisar = true;
  }
}

/**
 * Quem é você e quem é a empresa: nomes (como aparecem nos Pix) e documentos. Serve para
 * reconhecer retiradas e aportes mesmo quando só um lado da transferência foi importado
 * (ex.: o Pix sai da conta da empresa para uma conta pessoal que ainda não está no app).
 */
export interface Identidade {
  docsSocio: Set<string>;
  nomesSocio: string[];
  docsEmpresa: Set<string>;
  nomesEmpresa: string[];
}

/** Variações de um nome normalizado para procurar na descrição: o nome todo e "primeiro + último". */
export function variantesDeNome(nomeNormalizado: string): string[] {
  const palavras = nomeNormalizado.split(/\s+/).filter((p) => p.length >= 2 && !/^(DA|DE|DO|DAS|DOS|E|LTDA|ME|EPP|EIRELI|SA)$/.test(p));
  if (palavras.length < 2) return palavras.length === 1 && palavras[0].length >= 6 ? [palavras[0]] : [];
  const todo = nomeNormalizado.trim();
  const curto = `${palavras[0]} ${palavras[palavras.length - 1]}`;
  return [...new Set([todo, curto])];
}

function citaAlguem(t: TransacaoClassificavel, docs: Set<string>, nomes: string[]): boolean {
  if (t.documentoContraparte && docs.has(t.documentoContraparte)) return true;
  const textos = [t.descricaoNormalizada, t.nomeContraparteNormalizado ?? ""];
  return nomes.some((n) => n && textos.some((x) => new RegExp(`(^|\\W)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`).test(x)));
}

/**
 * Pix/TED entre você e a empresa com só um lado no app. Não mexe no que você, uma regra ou o
 * pareamento de transferências já decidiu. Retirada fica "para revisar" (pró-labore ou lucro?).
 */
export function aplicarIdentidade(t: TransacaoClassificavel, conta: ContaContexto, id: Identidade): boolean {
  if (t.parTransferenciaId !== null || conta.escopoPadrao === "misto") return false;
  if (!["comum", "pro_labore", "distribuicao_lucros", "despesa_pessoal_na_pj", "despesa_pj_na_pf"].includes(t.natureza)) return false;
  const empresa = citaAlguem(t, id.docsEmpresa, id.nomesEmpresa);
  const socio = !empresa && citaAlguem(t, id.docsSocio, id.nomesSocio);
  if (!empresa && !socio) return false;
  const jaSabe = t.natureza === "pro_labore" || t.natureza === "distribuicao_lucros";

  if (conta.escopoPadrao === "PJ" && t.valorCentavos < 0 && socio) {
    return aplicar(t, "transferencia", {
      natureza: jaSabe ? t.natureza : "retirada_socio",
      categoriaId: "mov_socio",
      escopo: "PJ",
      revisar: !jaSabe,
      motivo: "Pix da empresa para você (sócio)",
    });
  }
  if (conta.escopoPadrao === "PJ" && t.valorCentavos > 0 && socio) {
    return aplicar(t, "transferencia", { natureza: "aporte_socio", categoriaId: "mov_socio", escopo: "PJ", revisar: false, motivo: "Dinheiro seu entrando na empresa" });
  }
  if (conta.escopoPadrao === "PF" && t.valorCentavos > 0 && empresa) {
    return aplicar(t, "transferencia", {
      natureza: jaSabe ? t.natureza : "retirada_socio",
      categoriaId: "mov_socio",
      escopo: "PF",
      revisar: !jaSabe,
      motivo: "Dinheiro da empresa entrando na sua conta",
    });
  }
  if (conta.escopoPadrao === "PF" && t.valorCentavos < 0 && empresa) {
    return aplicar(t, "transferencia", { natureza: "aporte_socio", categoriaId: "mov_socio", escopo: "PF", revisar: false, motivo: "Dinheiro seu colocado na empresa" });
  }
  if (conta.escopoPadrao === "PJ" && empresa && t.valorCentavos !== 0) {
    return aplicar(t, "transferencia", { natureza: "transferencia_interna", categoriaId: "mov_transferencia", escopo: "PJ", revisar: false, motivo: "Entre contas da própria empresa" });
  }
  return false;
}
