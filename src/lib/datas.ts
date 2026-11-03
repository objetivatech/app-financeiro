/** Fuso dos bancos e do Asaas. O servidor roda em UTC; "hoje" para o usuário é em Brasília. */
export const FUSO = "America/Sao_Paulo";

/** Data de hoje (AAAA-MM-DD) no horário de Brasília. */
export function hojeBrasil(agora = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

export function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(iso + "T12:00:00Z") + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Primeiro dia do mês (AAAA-MM-01), deslocado em meses a partir do mês atual em Brasília. */
export function primeiroDoMes(deslocamento = 0, hoje = hojeBrasil()): string {
  const [ano, mes] = hoje.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1 + deslocamento, 1)).toISOString().slice(0, 10);
}
