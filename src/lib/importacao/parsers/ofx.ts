import { instituicaoPorCodigo, instituicaoPorTexto } from "../../instituicoes/catalogo";
import { ErroImportacao, type ExtratoNormalizado, type TransacaoExtraida } from "../tipos";
import { parseData, parseValorCentavos } from "../util";

/** Lê o valor de uma tag folha. Funciona em OFX 1.x (SGML, sem fechamento) e 2.x (XML). */
function tag(bloco: string, nome: string): string | undefined {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  const valor = m?.[1]?.trim();
  return valor ? decodificarEntidades(valor) : undefined;
}

function blocos(texto: string, nome: string): string[] {
  const re = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`, "gi");
  return [...texto.matchAll(re)].map((m) => m[1]);
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function pareceOfx(texto: string): boolean {
  return /OFXHEADER|<OFX>/i.test(texto.slice(0, 2000));
}

export function parseOfx(texto: string): ExtratoNormalizado {
  if (!pareceOfx(texto)) throw new ErroImportacao("O arquivo não parece ser um OFX válido.");

  const avisos: string[] = [];
  const ehCartao = /<CCACCTFROM>/i.test(texto);
  const contaBloco = blocos(texto, ehCartao ? "CCACCTFROM" : "BANKACCTFROM")[0] ?? texto;

  const bankId = tag(contaBloco, "BANKID");
  const org = tag(texto, "ORG");
  const instituicao =
    instituicaoPorCodigo(bankId) ?? (org ? instituicaoPorTexto(org) : undefined);

  const transacoes: TransacaoExtraida[] = [];
  for (const bloco of blocos(texto, "STMTTRN")) {
    const data = parseData(tag(bloco, "DTPOSTED") ?? "");
    const valor = parseValorCentavos(tag(bloco, "TRNAMT") ?? "");
    if (!data || valor === null) {
      avisos.push(`Transação ignorada por data/valor ilegível: ${bloco.slice(0, 80).replace(/\s+/g, " ")}`);
      continue;
    }
    const memo = tag(bloco, "MEMO");
    const nome = tag(bloco, "NAME");
    const descricao = [nome, memo].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(" - ");
    transacoes.push({
      data,
      descricao: descricao || "(sem descrição)",
      valorCentavos: valor,
      idExterno: tag(bloco, "FITID"),
    });
  }

  const listaBloco = blocos(texto, "BANKTRANLIST")[0] ?? "";
  const inicio = parseData(tag(listaBloco, "DTSTART") ?? "");
  const fim = parseData(tag(listaBloco, "DTEND") ?? "");
  const saldoBloco = blocos(texto, "LEDGERBAL")[0];
  const saldo = saldoBloco ? parseValorCentavos(tag(saldoBloco, "BALAMT") ?? "") : null;

  const tipoContaOfx = tag(contaBloco, "ACCTTYPE")?.toUpperCase();
  return {
    formato: "ofx",
    instituicaoId: instituicao?.id,
    instituicaoNomeLido: org ?? (bankId ? `Código ${bankId}` : undefined),
    conta: {
      tipo: ehCartao ? "cartao_credito" : tipoContaOfx === "SAVINGS" ? "poupanca" : "corrente",
      agencia: tag(contaBloco, "BRANCHID"),
      numero: tag(contaBloco, "ACCTID"),
    },
    periodo: inicio && fim ? { inicio, fim } : undefined,
    saldoFinalCentavos: saldo ?? undefined,
    moeda: tag(texto, "CURDEF") ?? "BRL",
    transacoes,
    avisos,
    extraidoPor: "parser",
  };
}
