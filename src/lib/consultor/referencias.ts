/**
 * Referências numéricas da gestão financeira usadas pelo app inteiro (cores dos indicadores,
 * avisos e o consultor). Mudou aqui, muda em todo lugar — e na skill, que cita estes números.
 */
export const REFERENCIAS = {
  /** PF: guardar ao menos 20% da renda. */
  taxaPoupancaBoa: 0.2,
  /** PF: reserva de emergência ideal (empresário/autônomo: renda variável). */
  reservaPfIdealMeses: 6,
  reservaPfMinimaMeses: 3,
  /** PJ: reserva de caixa da empresa, em meses de custo (com pró-labore). */
  reservaPjIdealMeses: 3,
  reservaPjMinimaMeses: 1,
  /** Parcelas (dívidas + cartão) sobre a renda: saudável até 30%, crítico acima de 40%. */
  comprometimentoSaudavel: 0.3,
  comprometimentoCritico: 0.4,
  /** Cartão: usar até 30% do limite; acima de 70% é sinal de aperto. */
  limiteCartaoSaudavel: 0.3,
  limiteCartaoAlto: 0.7,
  /** PJ: margem saudável para serviços. */
  margemBoa: 0.2,
  /** Simples Nacional: Fator R mínimo para o Anexo III. */
  fatorR: 0.28,
  /** Receita: um cliente acima disso é dependência perigosa. */
  concentracaoClienteAlta: 0.3,
  concentracaoClienteCritica: 0.5,
  /** Dívida cara: juros acima disso ao mês devem ser quitados primeiro. */
  jurosCaroMensal: 0.03,
  /** Compra grande (ex.: carro): parcela até 15% da renda e entrada de ao menos 20%. */
  parcelaGrandeMaxRenda: 0.15,
  entradaMinima: 0.2,
  /** Dias sem lançamentos numa conta ativa para lembrar de importar o extrato. */
  diasSemExtrato: 20,
} as const;
