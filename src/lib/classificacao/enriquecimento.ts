/**
 * Classificadores complementares, que rodam antes da IA (são gratuitos e explicáveis):
 *
 * 1. Histórico: o mesmo estabelecimento que você já classificou à mão recebe a mesma categoria.
 * 2. Dicionário de estabelecimentos brasileiros conhecidos (iFood, Uber, Netflix, Hostinger...).
 * 3. Atividade da empresa (CNAE) de quem recebeu o pagamento, quando o extrato traz o CNPJ.
 *
 * Tudo aqui é puro (sem banco nem rede); a busca de CNPJ fica em cnpj.ts e a orquestração em executar.ts.
 */
import type { Escopo } from "../importacao/tipos";

/** Tipo de gasto, independente de ser PF ou PJ. A categoria final depende do escopo. */
export type TipoGasto =
  | "mercado"
  | "alimentacao"
  | "transporte"
  | "saude"
  | "educacao"
  | "lazer"
  | "assinatura"
  | "software"
  | "compras"
  | "cuidados"
  | "familia"
  | "moradia"
  | "utilidades"
  | "marketing"
  | "contabilidade"
  | "impostos"
  | "tarifas"
  | "fornecedor";

/**
 * Categoria por escopo. Gastos de consumo (mercado, restaurante...) não têm categoria PJ: numa conta
 * da empresa eles ficam para a IA decidir, porque costumam ser gasto pessoal pago pela empresa.
 */
export const CATEGORIA_DO_TIPO: Record<TipoGasto, Partial<Record<Escopo, string>>> = {
  mercado: { PF: "pf_mercado" },
  alimentacao: { PF: "pf_alimentacao" },
  transporte: { PF: "pf_transporte" },
  saude: { PF: "pf_saude" },
  educacao: { PF: "pf_educacao" },
  lazer: { PF: "pf_lazer" },
  assinatura: { PF: "pf_assinaturas", PJ: "pj_software" },
  software: { PF: "pf_assinaturas", PJ: "pj_software" },
  compras: { PF: "pf_compras" },
  cuidados: { PF: "pf_cuidados" },
  familia: { PF: "pf_familia" },
  moradia: { PF: "pf_moradia", PJ: "pj_estrutura" },
  utilidades: { PF: "pf_moradia", PJ: "pj_estrutura" },
  marketing: { PJ: "pj_marketing" },
  contabilidade: { PJ: "pj_contabilidade" },
  impostos: { PF: "pf_impostos", PJ: "pj_impostos" },
  tarifas: { PF: "pf_juros_tarifas", PJ: "pj_tarifas" },
  fornecedor: { PJ: "pj_fornecedores" },
};

interface Estabelecimento {
  nome: string;
  padrao: RegExp;
  tipo: TipoGasto;
  /** Quando o estabelecimento só faz sentido para um lado (ex.: anúncios = empresa). */
  escopo?: Escopo;
}

/**
 * Estabelecimentos comuns no Brasil (descrição já normalizada: maiúsculas, sem acento).
 * Ordem importa: o primeiro que casar vence (ex.: "UBER EATS" antes de "UBER").
 */
export const ESTABELECIMENTOS: Estabelecimento[] = [
  // Alimentação
  { nome: "iFood", padrao: /\bIFOOD\b|\bIFD\*/, tipo: "alimentacao" },
  { nome: "Uber Eats", padrao: /UBER ?EATS/, tipo: "alimentacao" },
  { nome: "Rappi", padrao: /\bRAPPI\b/, tipo: "alimentacao" },
  { nome: "Zé Delivery", padrao: /ZE DELIVERY/, tipo: "alimentacao" },
  { nome: "McDonald's", padrao: /MC ?DONALDS|ARCOS DOURADOS/, tipo: "alimentacao" },
  { nome: "Burger King", padrao: /BURGER KING|\bBK BRASIL/, tipo: "alimentacao" },
  // Transporte
  { nome: "Uber", padrao: /\bUBER\b|UBER\s?\*?TRIP|UBR\*/, tipo: "transporte" },
  { nome: "99", padrao: /\b99 ?(APP|POP|TAXI|RIDE)\b/, tipo: "transporte" },
  { nome: "Cabify", padrao: /\bCABIFY\b/, tipo: "transporte" },
  { nome: "Posto de combustível", padrao: /\bPOSTO\b|\bSHELL\b|IPIRANGA|PETROBRAS|\bBR MANIA\b|AUTO POSTO/, tipo: "transporte" },
  { nome: "Pedágio/estacionamento", padrao: /SEM PARAR|CONECTCAR|\bVELOE\b|ESTACIONAMENTO|ESTAPAR|\bZUL\b/, tipo: "transporte" },
  // Mercado
  {
    nome: "Supermercado",
    padrao: /SUPERMERCADO|\bMERCADO (?!PAGO|LIVRE)|ATACADAO|CARREFOUR|ZAFFARI|BOURBON|\bASSAI\b|PAO DE ACUCAR|\bWALMART\b|\bMAXXI\b|\bCOMPER\b|ANGELONI|\bCONDOR\b|HIPERMERCADO|ATACAREJO|\bASUN\b|STOK CENTER|\bMACRO\b/,
    tipo: "mercado",
  },
  // Saúde
  { nome: "Farmácia", padrao: /DROGASIL|DROGA ?RAIA|\bPANVEL\b|PAGUE MENOS|DROGARIA|FARMACIA|SAO JOAO FARMA|\bNISSEI\b/, tipo: "saude" },
  { nome: "Plano de saúde", padrao: /\bUNIMED\b|\bAMIL\b|BRADESCO SAUDE|SULAMERICA SAUDE|HAPVIDA|NOTREDAME|ODONTOPREV/, tipo: "saude" },
  { nome: "Laboratório", padrao: /LABORATORIO|\bFLEURY\b|\bDASA\b|WEINMANN/, tipo: "saude" },
  { nome: "Academia", padrao: /SMART ?FIT|BLUE ?FIT|ACADEMIA|\bWELLHUB\b|GYMPASS|TOTALPASS/, tipo: "cuidados" },
  // Contas da casa / estrutura
  { nome: "Energia elétrica", padrao: /\bCEEE\b|EQUATORIAL|\bRGE\b|\bCPFL\b|\bENEL\b|\bCEMIG\b|\bCOPEL\b|\bCELESC\b|\bLIGHT S\b|ENERGISA|NEOENERGIA/, tipo: "utilidades" },
  { nome: "Água", padrao: /\bDMAE\b|\bCORSAN\b|\bSABESP\b|\bSANEPAR\b|\bAEGEA\b|\bCASAN\b|\bCEDAE\b/, tipo: "utilidades" },
  { nome: "Telefone e internet", padrao: /\bCLARO\b|\bVIVO\b|\bTIM\b|\bOI FIBRA\b|NET SERVICOS|\bSKY\b|DESKTOP INTERNET|\bBRISANET\b/, tipo: "utilidades" },
  { nome: "Condomínio/aluguel", padrao: /CONDOMINIO|ALUGUEL|IMOBILIARIA|QUINTOANDAR|QUINTO ANDAR/, tipo: "moradia" },
  // Assinaturas
  {
    nome: "Streaming",
    padrao: /NETFLIX|SPOTIFY|DISNEY|\bHBO\b|\bMAX\.COM|PRIME ?VIDEO|AMAZON ?PRIME|GLOBOPLAY|DEEZER|YOUTUBE ?PREMIUM|PARAMOUNT|CRUNCHYROLL|APPLE\.COM\/BILL|\bAPPLE COM BILL/,
    tipo: "assinatura",
  },
  // Ferramentas de trabalho (agência de marketing/SEO): empresa
  { nome: "Anúncios", padrao: /GOOGLE ?\*?ADS|ADWORDS|FACEBK|FACEBOOK ?ADS|META ?ADS|META PLATFORMS|LINKEDIN ?ADS|TIKTOK ?ADS/, tipo: "marketing", escopo: "PJ" },
  {
    nome: "Hospedagem, domínio e nuvem",
    padrao: /HOSTINGER|REGISTRO\.?BR|\bNIC\.?BR\b|CLOUDFLARE|AMAZON WEB SERVICES|\bAWS\b|DIGITALOCEAN|\bVERCEL\b|\bLOCAWEB\b|\bHOSTGATOR\b|GODADDY|\bKINGHOST\b|\bVULTR\b|\bHETZNER\b|\bNETLIFY\b/,
    tipo: "software",
    escopo: "PJ",
  },
  { nome: "Ferramentas de SEO", padrao: /SEMRUSH|AHREFS|\bMOZ\b|SCREAMING ?FROG|SE RANKING|UBERSUGGEST|SURFER ?SEO|DATAFORSEO|SIMILARWEB/, tipo: "software", escopo: "PJ" },
  {
    nome: "Software e IA",
    padrao: /\bGITHUB\b|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|\bCANVA\b|\bNOTION\b|GOOGLE ?\*?(WORKSPACE|GSUITE)|MICROSOFT|\bMSFT\b|\bADOBE\b|\bFIGMA\b|\bZAPIER\b|\bMAKE\.COM\b|RD STATION|\bHUBSPOT\b|\bSLACK\b|\bZOOM\b|LOVABLE|\bCURSOR\b/,
    tipo: "software",
  },
  { nome: "Contabilidade", padrao: /CONTABIL|CONTABILIDADE|CONTADOR/, tipo: "contabilidade", escopo: "PJ" },
  // Compras
  { nome: "Mercado Livre", padrao: /MERCADO ?LIVRE|\bMERCADOLIVRE\b|\bMELI\b/, tipo: "compras" },
  { nome: "Amazon", padrao: /AMAZON ?(MKTPLACE|MARKETPLACE|\.COM\.BR|BR\b|SERVICOS DE VAREJO)|AMZN/, tipo: "compras" },
  {
    nome: "Lojas",
    padrao: /MAGALU|MAGAZINE LUIZA|AMERICANAS|CASAS BAHIA|\bRENNER\b|\bC&A\b|\bCEA\b|RIACHUELO|CENTAURO|NETSHOES|ALIEXPRESS|\bSHEIN\b|\bTEMU\b|\bKABUM\b|LEROY MERLIN|TOK ?STOK|\bDECATHLON\b/,
    tipo: "compras",
  },
  // Família e pets
  { nome: "Pet shop", padrao: /\bPETZ\b|\bCOBASI\b|PETLOVE|PET SHOP|PETSHOP|VETERINARI/, tipo: "familia" },
  // Lazer e viagens
  { nome: "Lazer e viagens", padrao: /CINEMARK|INGRESSO|\bSYMPLA\b|\bAIRBNB\b|BOOKING|DECOLAR|\bLATAM\b|\bGOL LINHAS\b|AZUL LINHAS|\bHOTEL\b|POUSADA|\bCLICKBUS\b/, tipo: "lazer" },
  // Educação
  { nome: "Educação", padrao: /\bESCOLA\b|COLEGIO|FACULDADE|UNIVERSIDADE|\bUDEMY\b|\bALURA\b|HOTMART|COURSERA|DUOLINGO/, tipo: "educacao" },
  // Impostos e tarifas
  { nome: "Impostos pessoais", padrao: /\bIPVA\b|\bIPTU\b|\bDETRAN\b|LICENCIAMENTO|\bDPVAT\b/, tipo: "impostos" },
  { nome: "Juros e tarifas", padrao: /\bIOF\b|\bJUROS\b|ANUIDADE|TARIFA|\bMULTA\b|ENCARGOS|CESTA DE SERVICOS|MENSALIDADE PACOTE/, tipo: "tarifas" },
];

export interface DecisaoEnriquecimento {
  escopo?: Escopo;
  categoriaId: string;
  motivo: string;
}

/** Categoria pelo dicionário. `escopoAtual` é o que já se sabe (da conta ou de outra etapa). */
export function classificarPorEstabelecimento(descricaoNormalizada: string, valorCentavos: number, escopoAtual: Escopo | null): DecisaoEnriquecimento | null {
  if (valorCentavos >= 0) return null; // só gastos
  const e = ESTABELECIMENTOS.find((x) => x.padrao.test(descricaoNormalizada));
  if (!e) return null;
  const escopo = e.escopo ?? escopoAtual;
  if (!escopo) return null;
  const categoriaId = CATEGORIA_DO_TIPO[e.tipo][escopo];
  if (!categoriaId) return null;
  return { ...(e.escopo ? { escopo: e.escopo } : {}), categoriaId, motivo: `Estabelecimento conhecido: ${e.nome}` };
}

/**
 * Tipo de gasto pela atividade (CNAE) da empresa que recebeu o pagamento.
 * Usa a subclasse (7 dígitos) quando precisa separar dentro do varejo; senão a divisão (2 dígitos).
 */
export function tipoPorCnae(cnae: string | null | undefined): TipoGasto | null {
  const c = (cnae ?? "").replace(/\D/g, "");
  if (c.length < 4) return null;
  const divisao = c.slice(0, 2);
  const classe = c.slice(0, 4);
  if (divisao === "47") {
    if (classe === "4711" || classe === "4712" || /^472[1-9]/.test(classe)) return "mercado";
    if (classe === "4731" || classe === "4732") return "transporte";
    if (classe === "4771" || classe === "4772" || classe === "4773" || classe === "4774") return "saude";
    if (classe === "4761" || classe === "4762") return "educacao";
    if (classe === "4789" && c.startsWith("4789004")) return "familia"; // artigos para animais
    return "compras";
  }
  const porDivisao: Record<string, TipoGasto> = {
    "35": "utilidades",
    "36": "utilidades",
    "37": "utilidades",
    "45": "transporte",
    "46": "fornecedor",
    "49": "transporte",
    "50": "transporte",
    "51": "lazer",
    "52": "transporte",
    "55": "lazer",
    "56": "alimentacao",
    "58": "assinatura",
    "59": "assinatura",
    "60": "assinatura",
    "61": "utilidades",
    "62": "software",
    "63": "software",
    "68": "moradia",
    "69": "contabilidade",
    "73": "marketing",
    "75": "familia",
    "79": "lazer",
    "84": "impostos",
    "85": "educacao",
    "86": "saude",
    "87": "saude",
    "88": "saude",
    "90": "lazer",
    "91": "lazer",
    "93": "lazer",
  };
  if (classe === "9602") return "cuidados"; // cabeleireiros e estética
  if (classe === "9313") return "cuidados"; // academias
  return porDivisao[divisao] ?? null;
}

export function classificarPorCnae(
  cnae: string | null | undefined,
  descricaoCnae: string | null | undefined,
  valorCentavos: number,
  escopoAtual: Escopo | null,
): DecisaoEnriquecimento | null {
  if (valorCentavos >= 0 || !escopoAtual) return null;
  const tipo = tipoPorCnae(cnae);
  if (!tipo) return null;
  const categoriaId = CATEGORIA_DO_TIPO[tipo][escopoAtual];
  if (!categoriaId) return null;
  return { categoriaId, motivo: `Atividade de quem recebeu (CNAE ${cnae}${descricaoCnae ? `: ${descricaoCnae}` : ""})` };
}

const PREFIXOS = /^((PIX|TED|DOC|TEF|ENVIADO|ENVIADA|RECEBIDO|RECEBIDA|TRANSF\w*|PAGAMENTO|PAGTO|PAG|COMPRA|COMPRAS|DEBITO|CREDITO|CARTAO|NO|EM|DE|A|PARA)\b|[-*\s])+/;

/**
 * Chave do estabelecimento para comparar lançamentos parecidos: tira prefixos de meio de pagamento
 * ("PIX ENVIADO", "COMPRA CARTAO"), números (datas, parcelas, códigos) e fica com até 3 palavras.
 */
export function chaveDoEstabelecimento(descricaoNormalizada: string): string {
  const semPrefixo = descricaoNormalizada.replace(PREFIXOS, "");
  const palavras = semPrefixo
    .replace(/[0-9]+/g, " ")
    .replace(/[^A-Z& ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2);
  return palavras.slice(0, 3).join(" ");
}

export interface ExemploClassificado {
  descricaoNormalizada: string;
  valorCentavos: number;
  escopo: Escopo | null;
  categoriaId: string;
}

export type IndiceHistorico = Map<string, { escopo: Escopo | null; categoriaId: string; vezes: number }>;

/**
 * Índice das suas classificações manuais: para cada estabelecimento (e sentido: entrada/saída),
 * a decisão mais frequente, só quando ela é a de pelo menos 80% das vezes.
 */
export function indiceDoHistorico(exemplos: ExemploClassificado[]): IndiceHistorico {
  const contagem = new Map<string, Map<string, number>>();
  for (const e of exemplos) {
    const chave = chaveDoEstabelecimento(e.descricaoNormalizada);
    if (chave.length < 4) continue;
    const k = `${e.valorCentavos < 0 ? "-" : "+"}|${chave}`;
    const decisao = `${e.escopo ?? ""}|${e.categoriaId}`;
    const m = contagem.get(k) ?? new Map<string, number>();
    m.set(decisao, (m.get(decisao) ?? 0) + 1);
    contagem.set(k, m);
  }
  const indice: IndiceHistorico = new Map();
  for (const [k, m] of contagem) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [decisao, vezes] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (vezes / total < 0.8) continue;
    const [escopo, categoriaId] = decisao.split("|");
    indice.set(k, { escopo: (escopo || null) as Escopo | null, categoriaId, vezes });
  }
  return indice;
}

export function classificarPorHistorico(descricaoNormalizada: string, valorCentavos: number, indice: IndiceHistorico): DecisaoEnriquecimento | null {
  const chave = chaveDoEstabelecimento(descricaoNormalizada);
  if (chave.length < 4) return null;
  const achado = indice.get(`${valorCentavos < 0 ? "-" : "+"}|${chave}`);
  if (!achado) return null;
  return {
    ...(achado.escopo ? { escopo: achado.escopo } : {}),
    categoriaId: achado.categoriaId,
    motivo: `Igual a ${achado.vezes} lançamento(s) de "${chave}" que você já classificou`,
  };
}
