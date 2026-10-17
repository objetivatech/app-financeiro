import Papa from "papaparse";
import { instituicaoPorTexto } from "../../instituicoes/catalogo";
import type { ExtratoNormalizado, TipoConta, TransacaoExtraida } from "../tipos";
import { encontrarDocumento, normalizarTexto, parseData, parseValorCentavos } from "../util";

type Papel = "data" | "descricao" | "valor" | "credito" | "debito" | "natureza" | "identificador" | "complemento";

/** Nomes de coluna (normalizados) que reconhecemos para cada papel. A ordem indica prioridade. */
const SINONIMOS: Record<Papel, string[]> = {
  data: ["DATA LANCAMENTO", "DATA DO LANCAMENTO", "DATA MOVIMENTO", "DATA DA TRANSACAO", "DATA COMPRA", "DATA", "DATE", "DT LANCAMENTO", "DT"],
  descricao: ["DESCRICAO", "HISTORICO", "LANCAMENTO", "TITLE", "ESTABELECIMENTO", "DESCRIPTION", "DETALHES", "MEMO", "TRANSACAO"],
  complemento: ["DETALHE", "COMPLEMENTO", "OBSERVACAO", "DOCUMENTO"],
  valor: ["VALOR (R$)", "VALOR R$", "VALOR", "AMOUNT", "QUANTIA", "VALOR DA TRANSACAO", "VALOR EM R$"],
  credito: ["CREDITO", "CREDITO (R$)", "ENTRADA", "ENTRADAS", "RECEITA"],
  debito: ["DEBITO", "DEBITO (R$)", "SAIDA", "SAIDAS", "DESPESA"],
  natureza: ["D/C", "C/D", "TIPO", "NATUREZA", "TIPO LANCAMENTO", "TIPO DE TRANSACAO"],
  identificador: ["IDENTIFICADOR", "ID", "ID TRANSACAO", "CODIGO", "NSU"],
};

type Mapa = Partial<Record<Papel, number>>;

function mapearCabecalho(linha: string[]): Mapa {
  const nomes = linha.map((c) => normalizarTexto(c ?? ""));
  const mapa: Mapa = {};
  const usados = new Set<number>();
  for (const papel of Object.keys(SINONIMOS) as Papel[]) {
    for (const sinonimo of SINONIMOS[papel]) {
      const idx = nomes.findIndex((n, i) => !usados.has(i) && n === sinonimo);
      if (idx >= 0) {
        mapa[papel] = idx;
        usados.add(idx);
        break;
      }
    }
  }
  // Segunda passada: começa-com, para cabeçalhos como "Valor (R$) - Conta 123".
  for (const papel of Object.keys(SINONIMOS) as Papel[]) {
    if (mapa[papel] !== undefined) continue;
    const idx = nomes.findIndex((n, i) => !usados.has(i) && SINONIMOS[papel].some((s) => s.length > 3 && n.startsWith(s)));
    if (idx >= 0) {
      mapa[papel] = idx;
      usados.add(idx);
    }
  }
  return mapa;
}

function mapaUtil(m: Mapa): boolean {
  return m.data !== undefined && m.descricao !== undefined && (m.valor !== undefined || (m.credito !== undefined && m.debito !== undefined) || m.credito !== undefined || m.debito !== undefined);
}

export interface ResultadoCsv {
  extrato?: ExtratoNormalizado;
  /** Linhas brutas, para o fallback por IA quando não reconhecemos as colunas. */
  linhas: string[][];
}

/**
 * Lê CSVs de extrato/fatura de forma heurística: encontra a linha de cabeçalho,
 * identifica as colunas por sinônimos e converte valores no padrão brasileiro.
 * Quando não reconhece a estrutura, devolve `extrato` vazio para o chamador recorrer à IA.
 */
export function parseCsv(texto: string, nomeArquivo = ""): ResultadoCsv {
  const { data } = Papa.parse<string[]>(texto.trim(), { skipEmptyLines: "greedy", delimiter: "" });
  const linhas = data.map((l) => l.map((c) => (c ?? "").trim()));
  if (linhas.length < 2) return { linhas };

  let idxCabecalho = -1;
  let mapa: Mapa = {};
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const m = mapearCabecalho(linhas[i]);
    if (mapaUtil(m)) {
      idxCabecalho = i;
      mapa = m;
      break;
    }
  }
  if (idxCabecalho < 0) return { linhas };

  const cabecalho = linhas[idxCabecalho].map((c) => normalizarTexto(c));
  const preambulo = linhas.slice(0, idxCabecalho).map((l) => l.join(" ")).join("\n");
  const avisos: string[] = [];
  const transacoes: TransacaoExtraida[] = [];

  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const celula = (p: Papel) => (mapa[p] !== undefined ? linha[mapa[p]!] ?? "" : "");
    const data = parseData(celula("data"));
    if (!data) {
      // Linhas de total/saldo no fim do arquivo não têm data: ignoramos sem alarde.
      if (linha.some((c) => c)) avisos.push(`Linha ignorada (sem data válida): ${linha.join(" | ").slice(0, 100)}`);
      continue;
    }
    const descricao = [celula("descricao"), celula("complemento")].filter(Boolean).join(" - ");
    // Linhas de saldo informativo que alguns bancos intercalam no extrato.
    if (/^SALDO (DO DIA|ANTERIOR|FINAL|EM CONTA|TOTAL|DISPONIVEL)/.test(normalizarTexto(descricao))) continue;

    let valor: number | null = null;
    if (mapa.valor !== undefined) {
      valor = parseValorCentavos(celula("valor"));
    } else {
      const c = parseValorCentavos(celula("credito")) ?? 0;
      const d = parseValorCentavos(celula("debito")) ?? 0;
      valor = Math.abs(c) - Math.abs(d);
      if (c === 0 && d === 0 && !celula("credito") && !celula("debito")) valor = null;
    }
    if (valor === null) {
      avisos.push(`Linha ignorada (valor ilegível): ${linha.join(" | ").slice(0, 100)}`);
      continue;
    }
    const natureza = normalizarTexto(celula("natureza"));
    if (natureza && valor > 0 && /^(D|DEBITO|SAIDA)$/.test(natureza)) valor = -valor;


    transacoes.push({
      data,
      descricao: descricao || "(sem descrição)",
      valorCentavos: valor,
      idExterno: celula("identificador") || undefined,
    });
  }

  const textoIdentificacao = `${nomeArquivo}\n${preambulo}`;
  const assinatura = cabecalho.join(",");
  let instituicaoId = instituicaoPorTexto(textoIdentificacao)?.id;
  let tipo: TipoConta | undefined;

  // Assinaturas conhecidas de exportações.
  if (assinatura === "DATE,TITLE,AMOUNT") {
    // Fatura do cartão Nubank: compras vêm positivas.
    instituicaoId ??= "nubank";
    tipo = "cartao_credito";
  } else if (assinatura === "DATA,VALOR,IDENTIFICADOR,DESCRICAO") {
    instituicaoId ??= "nubank";
    tipo = "corrente";
  }

  if (!tipo && /FATURA|CARTAO|CREDIT CARD/.test(normalizarTexto(textoIdentificacao))) tipo = "cartao_credito";

  if (tipo === "cartao_credito" && transacoes.length > 0) {
    const positivas = transacoes.filter((t) => t.valorCentavos > 0).length;
    if (positivas > transacoes.length / 2) {
      // Faturas costumam listar compras como positivas; nossa convenção é compra = saída (negativa).
      for (const t of transacoes) t.valorCentavos = -t.valorCentavos;
      avisos.push("Sinais invertidos: na fatura as compras vinham positivas.");
    }
  }

  const doc = encontrarDocumento(preambulo);
  return {
    linhas,
    extrato: {
      formato: "csv",
      instituicaoId,
      conta: { tipo, documentoTitular: doc?.numero },
      moeda: "BRL",
      transacoes,
      avisos,
      extraidoPor: "parser",
    },
  };
}
