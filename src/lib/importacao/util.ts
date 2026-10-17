/** Remove acentos, colapsa espaços e coloca em maiúsculas. Útil para comparar textos de extrato. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Converte valores monetários como aparecem em extratos brasileiros para centavos.
 * Aceita: "1.234,56", "-1.234,56", "R$ 1.234,56", "1234.56", "(1.234,56)", "1.234,56 D", "1.234,56-".
 * Retorna null quando não reconhece.
 */
export function parseValorCentavos(bruto: string | number): number | null {
  if (typeof bruto === "number") {
    return Number.isFinite(bruto) ? Math.round(bruto * 100) : null;
  }
  let s = bruto.trim();
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  // Sufixos usados por alguns bancos: D = débito, C = crédito.
  const sufixo = s.match(/\s*([DC])$/i);
  if (sufixo) {
    if (sufixo[1].toUpperCase() === "D") negativo = true;
    s = s.slice(0, sufixo.index);
  }
  s = s.replace(/R\$|\s/gi, "");
  if (s.endsWith("-")) {
    negativo = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  let normalizado: string;
  if (ultimaVirgula > ultimoPonto) {
    // Formato brasileiro: ponto = milhar, vírgula = decimal.
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto > ultimaVirgula) {
    const casasAposPonto = s.length - ultimoPonto - 1;
    const pontos = s.split(".").length - 1;
    if (ultimaVirgula === -1 && (pontos > 1 || casasAposPonto === 3)) {
      // "1.234" ou "1.234.567" sem decimais: em extratos BR o ponto é separador de milhar.
      normalizado = s.replace(/\./g, "");
    } else {
      // Formato americano: vírgula = milhar, ponto = decimal.
      normalizado = s.replace(/,/g, "");
    }
  } else {
    normalizado = s;
  }
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return null;
  const centavos = Math.round(numero * 100);
  return negativo ? -centavos : centavos;
}

function dataValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function iso(ano: number, mes: number, dia: number): string {
  return `${ano.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}-${dia
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Converte datas de extratos para ISO (AAAA-MM-DD).
 * Aceita: "15/01/2024", "15/01/24", "15-01-2024", "2024-01-15", "20240115", "20240115120000[-3:BRT]".
 */
export function parseData(bruto: string): string | null {
  const s = bruto.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dataValida(ano, mes, dia) ? iso(ano, mes, dia) : null;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = Number(m[3]);
    if (m[3].length === 2) ano += 2000;
    return dataValida(ano, mes, dia) ? iso(ano, mes, dia) : null;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return dataValida(ano, mes, dia) ? iso(ano, mes, dia) : null;
  }
  return null;
}

export function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function cpfValido(cpf: string): boolean {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(d[t])) return false;
  }
  return true;
}

export function cnpjValido(cnpj: string): boolean {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13]);
}

/** Procura o primeiro CPF ou CNPJ válido num texto. */
export function encontrarDocumento(texto: string): { tipo: "CPF" | "CNPJ"; numero: string } | null {
  const cnpjs = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) ?? [];
  for (const c of cnpjs) if (cnpjValido(c)) return { tipo: "CNPJ", numero: somenteDigitos(c) };
  const cpfs = texto.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? [];
  for (const c of cpfs) if (cpfValido(c)) return { tipo: "CPF", numero: somenteDigitos(c) };
  return null;
}
