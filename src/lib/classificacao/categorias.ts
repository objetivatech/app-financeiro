import type { Escopo } from "../importacao/tipos";

export interface CategoriaPadrao {
  id: string;
  nome: string;
  escopo: Escopo | null;
  grupo: "receita" | "despesa" | "movimentacao";
}

/** Categorias iniciais. O id é estável (usado por regras e pela IA); o nome pode mudar. */
export const CATEGORIAS_PADRAO: CategoriaPadrao[] = [
  // Pessoa física
  { id: "pf_renda", nome: "Renda pessoal (pró-labore, lucros, salário)", escopo: "PF", grupo: "receita" },
  { id: "pf_outras_receitas", nome: "Outras receitas pessoais", escopo: "PF", grupo: "receita" },
  { id: "pf_moradia", nome: "Moradia (aluguel, condomínio, contas da casa)", escopo: "PF", grupo: "despesa" },
  { id: "pf_mercado", nome: "Mercado", escopo: "PF", grupo: "despesa" },
  { id: "pf_alimentacao", nome: "Restaurantes e delivery", escopo: "PF", grupo: "despesa" },
  { id: "pf_transporte", nome: "Transporte e combustível", escopo: "PF", grupo: "despesa" },
  { id: "pf_saude", nome: "Saúde e farmácia", escopo: "PF", grupo: "despesa" },
  { id: "pf_educacao", nome: "Educação", escopo: "PF", grupo: "despesa" },
  { id: "pf_lazer", nome: "Lazer e viagens", escopo: "PF", grupo: "despesa" },
  { id: "pf_assinaturas", nome: "Assinaturas e streaming", escopo: "PF", grupo: "despesa" },
  { id: "pf_compras", nome: "Compras e vestuário", escopo: "PF", grupo: "despesa" },
  { id: "pf_cuidados", nome: "Cuidados pessoais", escopo: "PF", grupo: "despesa" },
  { id: "pf_familia", nome: "Família, pets e presentes", escopo: "PF", grupo: "despesa" },
  { id: "pf_juros_tarifas", nome: "Juros, IOF e tarifas pessoais", escopo: "PF", grupo: "despesa" },
  { id: "pf_impostos", nome: "Impostos pessoais (IR, IPVA, IPTU)", escopo: "PF", grupo: "despesa" },
  { id: "pf_outros", nome: "Outras despesas pessoais", escopo: "PF", grupo: "despesa" },
  // Pessoa jurídica
  { id: "pj_receita", nome: "Receita de vendas e serviços", escopo: "PJ", grupo: "receita" },
  { id: "pj_outras_receitas", nome: "Outras receitas da empresa", escopo: "PJ", grupo: "receita" },
  { id: "pj_impostos", nome: "Impostos (DAS do Simples e outros)", escopo: "PJ", grupo: "despesa" },
  { id: "pj_folha", nome: "Folha, pró-labore e encargos", escopo: "PJ", grupo: "despesa" },
  { id: "pj_contabilidade", nome: "Contabilidade e jurídico", escopo: "PJ", grupo: "despesa" },
  { id: "pj_fornecedores", nome: "Fornecedores e terceiros", escopo: "PJ", grupo: "despesa" },
  { id: "pj_software", nome: "Software, SaaS e hospedagem", escopo: "PJ", grupo: "despesa" },
  { id: "pj_marketing", nome: "Marketing e anúncios", escopo: "PJ", grupo: "despesa" },
  { id: "pj_estrutura", nome: "Aluguel, internet e estrutura", escopo: "PJ", grupo: "despesa" },
  { id: "pj_taxas_pagamento", nome: "Taxas de meios de pagamento", escopo: "PJ", grupo: "despesa" },
  { id: "pj_tarifas", nome: "Tarifas bancárias e juros da empresa", escopo: "PJ", grupo: "despesa" },
  { id: "pj_equipamentos", nome: "Equipamentos", escopo: "PJ", grupo: "despesa" },
  { id: "pj_outros", nome: "Outras despesas da empresa", escopo: "PJ", grupo: "despesa" },
  // Movimentações (não são receita nem despesa de verdade)
  { id: "mov_transferencia", nome: "Transferência entre contas próprias", escopo: null, grupo: "movimentacao" },
  { id: "mov_socio", nome: "Movimentação sócio ↔ empresa", escopo: null, grupo: "movimentacao" },
  { id: "mov_fatura", nome: "Pagamento de fatura de cartão", escopo: null, grupo: "movimentacao" },
  { id: "mov_investimento", nome: "Aplicação/resgate de investimento", escopo: null, grupo: "movimentacao" },
];

export const IDS_CATEGORIAS = new Set(CATEGORIAS_PADRAO.map((c) => c.id));
