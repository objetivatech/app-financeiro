const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarMoeda(centavos: number): string {
  return moeda.format(centavos / 100);
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function formatarMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${NOMES_MES[Number(m) - 1]}/${ano}`;
}

export function deslocarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export const ROTULOS_NATUREZA: Record<string, string> = {
  comum: "Comum",
  transferencia_interna: "Entre contas próprias",
  retirada_socio: "Retirada do sócio (definir)",
  pro_labore: "Pró-labore",
  distribuicao_lucros: "Distribuição de lucros",
  aporte_socio: "Aporte do sócio",
  despesa_pessoal_na_pj: "Gasto pessoal pago pela empresa",
  despesa_pj_na_pf: "Gasto da empresa pago pela PF",
  pagamento_fatura: "Pagamento de fatura",
  imposto: "Imposto",
  estorno: "Estorno",
  investimento: "Investimento",
};

export const ROTULOS_TIPO_CONTA: Record<string, string> = {
  corrente: "Conta corrente",
  pagamento: "Conta de pagamento",
  poupanca: "Poupança",
  cartao_credito: "Cartão de crédito",
  investimento: "Investimentos",
};
