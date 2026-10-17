import { normalizarTexto } from "../importacao/util";

export type TipoInstituicao = "banco" | "instituicao_pagamento" | "emissor_cartao" | "corretora" | "internacional";

export interface Instituicao {
  id: string;
  nome: string;
  tipo: TipoInstituicao;
  /**
   * Código COMPE de 3 dígitos (aparece como BANKID no OFX).
   * Confira na lista oficial de participantes do STR/BCB antes de depender dele para algo crítico.
   */
  codigoCompe?: string;
  /** Termos (já normalizados) que identificam a instituição em cabeçalhos, nomes de arquivo e textos. */
  aliases: string[];
}

/**
 * Catálogo inicial: instituições que o usuário do piloto usa + grandes bancos comuns.
 * A detecção por texto usa os aliases; a detecção por OFX usa o código COMPE.
 */
export const INSTITUICOES: Instituicao[] = [
  // Contas usadas no piloto
  { id: "asaas", nome: "Asaas", tipo: "instituicao_pagamento", codigoCompe: "461", aliases: ["ASAAS"] },
  { id: "mercadopago", nome: "Mercado Pago", tipo: "instituicao_pagamento", codigoCompe: "323", aliases: ["MERCADO PAGO", "MERCADOPAGO"] },
  { id: "pagbank", nome: "PagBank", tipo: "instituicao_pagamento", codigoCompe: "290", aliases: ["PAGBANK", "PAGSEGURO"] },
  { id: "neon", nome: "Neon", tipo: "instituicao_pagamento", codigoCompe: "536", aliases: ["NEON PAGAMENTOS", "BANCO NEON", "NEON"] },
  { id: "caixa", nome: "Caixa Econômica Federal", tipo: "banco", codigoCompe: "104", aliases: ["CAIXA ECONOMICA", "CAIXA"] },
  { id: "btg", nome: "BTG Pactual", tipo: "banco", codigoCompe: "208", aliases: ["BTG PACTUAL", "BTG"] },
  { id: "bs2", nome: "Banco BS2", tipo: "banco", codigoCompe: "218", aliases: ["BANCO BS2", "BS2"] },
  { id: "nubank", nome: "Nubank", tipo: "instituicao_pagamento", codigoCompe: "260", aliases: ["NU PAGAMENTOS", "NUBANK", "NU FINANCEIRA"] },
  { id: "efi", nome: "Efí (antiga Gerencianet)", tipo: "instituicao_pagamento", codigoCompe: "364", aliases: ["EFI S.A", "EFI BANK", "GERENCIANET", "SEJAEFI"] },
  { id: "xp", nome: "XP Investimentos", tipo: "corretora", codigoCompe: "102", aliases: ["XP INVESTIMENTOS", "BANCO XP", "XP INC"] },
  { id: "paypal", nome: "PayPal", tipo: "instituicao_pagamento", aliases: ["PAYPAL"] },
  { id: "maree", nome: "Maree", tipo: "instituicao_pagamento", aliases: ["MAREE"] },
  { id: "99pay", nome: "99Pay", tipo: "instituicao_pagamento", aliases: ["99PAY", "99 PAY"] },
  { id: "wise", nome: "Wise", tipo: "internacional", aliases: ["WISE", "TRANSFERWISE"] },
  // Cartões usados no piloto
  { id: "senff", nome: "Cartão Senff", tipo: "emissor_cartao", aliases: ["SENFF"] },
  { id: "atacadao", nome: "Cartão Atacadão (Banco CSF)", tipo: "emissor_cartao", aliases: ["ATACADAO"] },
  { id: "carrefour", nome: "Cartão Carrefour (Banco CSF)", tipo: "emissor_cartao", codigoCompe: "368", aliases: ["CARREFOUR", "BANCO CSF"] },
  { id: "bradescard", nome: "Bradescard (Amazon)", tipo: "emissor_cartao", codigoCompe: "063", aliases: ["BRADESCARD", "AMAZON MASTERCARD", "CARTAO AMAZON"] },
  { id: "dmcard", nome: "DMCard (Desco)", tipo: "emissor_cartao", aliases: ["DMCARD", "DM CARD", "DESCO"] },
  { id: "marisa", nome: "Cartão Marisa", tipo: "emissor_cartao", aliases: ["MARISA"] },
  { id: "shopee", nome: "Cartão Shopee", tipo: "emissor_cartao", aliases: ["SHOPEE"] },
  // Grandes bancos e outros comuns
  { id: "bb", nome: "Banco do Brasil", tipo: "banco", codigoCompe: "001", aliases: ["BANCO DO BRASIL"] },
  { id: "bradesco", nome: "Bradesco", tipo: "banco", codigoCompe: "237", aliases: ["BRADESCO"] },
  { id: "itau", nome: "Itaú Unibanco", tipo: "banco", codigoCompe: "341", aliases: ["ITAU UNIBANCO", "ITAU"] },
  { id: "santander", nome: "Santander", tipo: "banco", codigoCompe: "033", aliases: ["SANTANDER"] },
  { id: "inter", nome: "Banco Inter", tipo: "banco", codigoCompe: "077", aliases: ["BANCO INTER"] },
  { id: "c6", nome: "C6 Bank", tipo: "banco", codigoCompe: "336", aliases: ["C6 BANK", "BANCO C6"] },
  { id: "picpay", nome: "PicPay", tipo: "instituicao_pagamento", codigoCompe: "380", aliases: ["PICPAY"] },
  { id: "sicoob", nome: "Sicoob", tipo: "banco", codigoCompe: "756", aliases: ["SICOOB", "BANCOOB"] },
  { id: "sicredi", nome: "Sicredi", tipo: "banco", codigoCompe: "748", aliases: ["SICREDI"] },
];

const porId = new Map(INSTITUICOES.map((i) => [i.id, i]));

export function obterInstituicao(id: string | undefined): Instituicao | undefined {
  return id ? porId.get(id) : undefined;
}

export function instituicaoPorCodigo(codigo: string | undefined): Instituicao | undefined {
  if (!codigo) return undefined;
  const digitos = codigo.replace(/\D/g, "");
  if (!digitos) return undefined;
  const normalizado = digitos.slice(-3).padStart(3, "0");
  return INSTITUICOES.find((i) => i.codigoCompe === normalizado);
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Procura a instituição citada num texto (cabeçalho do arquivo, nome do arquivo, texto do PDF).
 * Prefere o alias mais longo para evitar que "CAIXA" vença "CAIXA ECONOMICA" de outra linha, por exemplo.
 */
export function instituicaoPorTexto(texto: string): Instituicao | undefined {
  const alvo = normalizarTexto(texto).replace(/[_-]+/g, " ");
  let melhor: { inst: Instituicao; tamanho: number } | undefined;
  for (const inst of INSTITUICOES) {
    for (const alias of inst.aliases) {
      const re = new RegExp(`(^|[^A-Z0-9])${escaparRegex(alias)}($|[^A-Z0-9])`);
      if (re.test(alvo) && (!melhor || alias.length > melhor.tamanho)) {
        melhor = { inst, tamanho: alias.length };
      }
    }
  }
  return melhor?.inst;
}
