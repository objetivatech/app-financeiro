import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { NATUREZAS, type Natureza } from "../naturezas";

/** Conteúdo binário (arquivo enviado), guardado só até o processamento terminar. */
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const escopoEnum = pgEnum("escopo", ["PF", "PJ"]);
/** Escopo padrão de uma conta: "misto" quando a mesma conta é usada para PF e PJ. */
export const escopoContaEnum = pgEnum("escopo_conta", ["PF", "PJ", "misto"]);
export const tipoContaEnum = pgEnum("tipo_conta", ["corrente", "pagamento", "poupanca", "cartao_credito", "investimento"]);
/** "api" = dados que vieram de integração (ex.: extrato do Asaas), não de arquivo. */
export const formatoEnum = pgEnum("formato_arquivo", ["ofx", "csv", "pdf", "imagem", "api"]);
export const origemClassificacaoEnum = pgEnum("origem_classificacao", ["conta", "regra", "heuristica", "transferencia", "ia", "usuario"]);

export { NATUREZAS, type Natureza };
export const naturezaEnum = pgEnum("natureza", NATUREZAS);

export const titulares = pgTable("titulares", {
  id: serial("id").primaryKey(),
  tipo: escopoEnum("tipo").notNull(),
  nome: text("nome").notNull(),
  /** CPF ou CNPJ, só dígitos. */
  documento: text("documento").unique(),
  /** Para PJ: "simples_nacional", "mei", "lucro_presumido"... */
  regimeTributario: text("regime_tributario"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const contas = pgTable(
  "contas",
  {
    id: serial("id").primaryKey(),
    /** id do catálogo em src/lib/instituicoes/catalogo.ts (null se não reconhecida). */
    instituicaoId: text("instituicao_id"),
    instituicaoNome: text("instituicao_nome").notNull(),
    apelido: text("apelido").notNull(),
    tipo: tipoContaEnum("tipo").notNull().default("corrente"),
    agencia: text("agencia"),
    numero: text("numero"),
    finalCartao: text("final_cartao"),
    titularId: integer("titular_id").references(() => titulares.id),
    escopoPadrao: escopoContaEnum("escopo_padrao").notNull().default("misto"),
    ativa: boolean("ativa").notNull().default(true),
    /** Marcação do usuário para limpar a vida financeira. */
    candidataEncerrar: boolean("candidata_encerrar").notNull().default(false),
    observacao: text("observacao"),
    /** Cartão de crédito: dia em que a fatura fecha (compras a partir dele vão para a fatura seguinte). */
    diaFechamento: integer("dia_fechamento"),
    /** Cartão de crédito: dia de vencimento da fatura. */
    diaVencimento: integer("dia_vencimento"),
    /** Cartão de crédito: limite total. */
    limiteCentavos: bigint("limite_centavos", { mode: "number" }),
    /** Cartão de crédito: conta de onde sai o pagamento da fatura (para o fluxo de caixa e a conciliação). */
    contaPagamentoId: integer("conta_pagamento_id"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contas_instituicao_idx").on(t.instituicaoId)],
);

export const importacoes = pgTable("importacoes", {
  id: serial("id").primaryKey(),
  contaId: integer("conta_id")
    .notNull()
    .references(() => contas.id, { onDelete: "cascade" }),
  nomeArquivo: text("nome_arquivo").notNull(),
  /** SHA-256 do arquivo: impede importar o mesmo arquivo duas vezes. */
  hashArquivo: text("hash_arquivo").notNull().unique(),
  formato: formatoEnum("formato").notNull(),
  extraidoPor: text("extraido_por").notNull(),
  periodoInicio: date("periodo_inicio"),
  periodoFim: date("periodo_fim"),
  saldoFinalCentavos: bigint("saldo_final_centavos", { mode: "number" }),
  qtdNovas: integer("qtd_novas").notNull().default(0),
  qtdDuplicadas: integer("qtd_duplicadas").notNull().default(0),
  avisos: jsonb("avisos").$type<string[]>().notNull().default([]),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const categorias = pgTable("categorias", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  /** PF, PJ ou null quando serve aos dois (ex.: transferências). */
  escopo: escopoEnum("escopo"),
  grupo: text("grupo").notNull(),
});

export const transacoes = pgTable(
  "transacoes",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    importacaoId: integer("importacao_id").references(() => importacoes.id, { onDelete: "set null" }),
    data: date("data").notNull(),
    descricao: text("descricao").notNull(),
    descricaoNormalizada: text("descricao_normalizada").notNull(),
    valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
    idExterno: text("id_externo"),
    /** Chave de deduplicação entre importações e formatos (ver importacao/persistir.ts). */
    hashDedup: text("hash_dedup").notNull(),
    nomeContraparte: text("nome_contraparte"),
    documentoContraparte: text("documento_contraparte"),
    parcelaAtual: integer("parcela_atual"),
    parcelaTotal: integer("parcela_total"),
    escopo: escopoEnum("escopo"),
    categoriaId: text("categoria_id").references(() => categorias.id),
    natureza: naturezaEnum("natureza").notNull().default("comum"),
    classificadoPor: origemClassificacaoEnum("classificado_por"),
    confianca: real("confianca"),
    /** Explicação curta da classificação (útil para revisar o que a IA decidiu). */
    motivo: text("motivo"),
    /** Outra perna de uma transferência entre contas do próprio usuário. */
    parTransferenciaId: integer("par_transferencia_id"),
    revisar: boolean("revisar").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transacoes_dedup_idx").on(t.contaId, t.hashDedup),
    index("transacoes_data_idx").on(t.data),
    index("transacoes_revisar_idx").on(t.revisar).where(sql`${t.revisar} = true`),
  ],
);

/** Regras aprendidas com as correções do usuário: "descrição contém X → escopo/categoria/natureza". */
export const regras = pgTable("regras", {
  id: serial("id").primaryKey(),
  /** Trecho normalizado (sem acento, maiúsculas) que deve aparecer na descrição. */
  padrao: text("padrao").notNull(),
  /** Restringe a regra a uma conta (null = todas). */
  contaId: integer("conta_id").references(() => contas.id, { onDelete: "cascade" }),
  escopo: escopoEnum("escopo"),
  categoriaId: text("categoria_id").references(() => categorias.id),
  natureza: naturezaEnum("natureza"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Preferências do usuário (ex.: descrição da empresa, usada como contexto pela IA). */
export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: jsonb("valor").notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type Conta = typeof contas.$inferSelect;
export type Transacao = typeof transacoes.$inferSelect;
export type Regra = typeof regras.$inferSelect;
export type Categoria = typeof categorias.$inferSelect;

/** Análises geradas pela IA (dicas e diagnóstico de um período). */
export const analises = pgTable("analises", {
  id: serial("id").primaryKey(),
  periodoInicio: date("periodo_inicio").notNull(),
  periodoFim: date("periodo_fim").notNull(),
  conteudo: text("conteudo").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const statusTrabalhoEnum = pgEnum("status_trabalho", ["fila", "processando", "concluido", "erro"]);

/**
 * Fila de importação: o upload só grava o arquivo aqui e responde na hora; um processo em
 * segundo plano (importacao/fila.ts) lê e classifica. Assim a leitura por IA, que pode levar
 * minutos, não depende da conexão do navegador ficar aberta.
 */
export const trabalhosImportacao = pgTable("trabalhos_importacao", {
  id: serial("id").primaryKey(),
  nomeArquivo: text("nome_arquivo").notNull(),
  /** Conta escolhida pelo usuário no upload (null = detectar). */
  contaId: integer("conta_id").references(() => contas.id, { onDelete: "set null" }),
  /** Apagado ao concluir, para não guardar o extrato duas vezes. */
  arquivo: bytea("arquivo"),
  status: statusTrabalhoEnum("status").notNull().default("fila"),
  mensagem: text("mensagem"),
  resultado: jsonb("resultado"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
});

export type TrabalhoImportacao = typeof trabalhosImportacao.$inferSelect;

/** Integrações com serviços externos (Asaas, Mercado Pago...): estado da última sincronização. */
export const integracoes = pgTable("integracoes", {
  /** Identificador fixo: "asaas", "mercadopago". */
  id: text("id").primaryKey(),
  status: text("status").notNull().default("nunca"),
  mensagem: text("mensagem"),
  ultimaSincronizacao: timestamp("ultima_sincronizacao", { withTimezone: true }),
  /** Último dia do extrato já trazido (o próximo começa no dia seguinte). */
  extratoAte: date("extrato_ate"),
  contaId: integer("conta_id").references(() => contas.id, { onDelete: "set null" }),
  /** Dados livres da integração: saldo atual, totais da última sincronização etc. */
  dados: jsonb("dados").$type<Record<string, unknown>>().notNull().default({}),
});

/** Clientes (de quem a empresa recebe), vindos das integrações. */
export const clientes = pgTable(
  "clientes",
  {
    id: serial("id").primaryKey(),
    origem: text("origem").notNull(),
    idExterno: text("id_externo").notNull(),
    nome: text("nome").notNull(),
    documento: text("documento"),
    email: text("email"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clientes_origem_idx").on(t.origem, t.idExterno)],
);

export const tipoDividaEnum = pgEnum("tipo_divida", [
  "acordo_judicial",
  "emprestimo",
  "parcelamento_imposto",
  "financiamento",
  "compra_parcelada",
  "outro",
]);

/**
 * Dívidas com parcelas (acordos, empréstimos, parcelamentos). As parcelas viram `compromissos`
 * do tipo "pagar"; a dívida guarda os dados para custo efetivo e estratégia de quitação.
 */
export const dividas = pgTable("dividas", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  credor: text("credor"),
  tipo: tipoDividaEnum("tipo").notNull().default("outro"),
  escopo: escopoEnum("escopo").notNull(),
  /** Quanto você recebeu de fato (para calcular o custo da dívida). Opcional. */
  valorRecebidoCentavos: bigint("valor_recebido_centavos", { mode: "number" }),
  /** Atraso que causa perda do acordo/benefício (ex.: 30 dias no acordo judicial). Null = sem regra. */
  diasTolerancia: integer("dias_tolerancia"),
  /** O que acontece se passar da tolerância (mostrado no alerta). */
  consequenciaAtraso: text("consequencia_atraso"),
  /** Lembrete depois de pagar (ex.: enviar comprovante por e-mail em 2 dias úteis). */
  lembreteAposPagar: text("lembrete_apos_pagar"),
  contaId: integer("conta_id").references(() => contas.id, { onDelete: "set null" }),
  observacao: text("observacao"),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Contas fixas que se repetem todo mês (pró-labore, DAS, contabilidade, aluguel...). */
export const recorrencias = pgTable("recorrencias", {
  id: serial("id").primaryKey(),
  descricao: text("descricao").notNull(),
  tipo: text("tipo").notNull().default("pagar"),
  escopo: escopoEnum("escopo").notNull(),
  /** Valor estimado; o real vem do extrato na conciliação. */
  valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
  diaVencimento: integer("dia_vencimento").notNull(),
  categoriaId: text("categoria_id").references(() => categorias.id),
  contaId: integer("conta_id").references(() => contas.id, { onDelete: "set null" }),
  /** Trecho da descrição no extrato que identifica o pagamento (ajuda a conciliar). */
  padraoExtrato: text("padrao_extrato"),
  inicio: date("inicio").notNull(),
  fim: date("fim"),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const tipoCompromissoEnum = pgEnum("tipo_compromisso", ["receber", "pagar"]);
export const statusCompromissoEnum = pgEnum("status_compromisso", ["aberto", "vencido", "pago", "cancelado"]);

/**
 * Compromissos: o que vai entrar ou sair (contas a receber e a pagar).
 * Vêm de integrações (cobranças do Asaas), de recorrências ou de lançamento manual.
 * Quando o dinheiro aparece no extrato, `transacaoId` liga o previsto ao realizado (conciliação).
 */
export const compromissos = pgTable(
  "compromissos",
  {
    id: serial("id").primaryKey(),
    tipo: tipoCompromissoEnum("tipo").notNull(),
    escopo: escopoEnum("escopo").notNull(),
    descricao: text("descricao").notNull(),
    clienteId: integer("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    /** Sempre positivo; o tipo diz se entra ou sai. */
    valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
    /** Valor líquido (já descontadas as taxas), quando a origem informa. */
    valorLiquidoCentavos: bigint("valor_liquido_centavos", { mode: "number" }),
    vencimento: date("vencimento").notNull(),
    status: statusCompromissoEnum("status").notNull().default("aberto"),
    dataPagamento: date("data_pagamento"),
    /** Quando o dinheiro fica disponível na conta (cartão de crédito demora). */
    dataCredito: date("data_credito"),
    formaPagamento: text("forma_pagamento"),
    categoriaId: text("categoria_id").references(() => categorias.id),
    contaId: integer("conta_id").references(() => contas.id, { onDelete: "set null" }),
    transacaoId: integer("transacao_id").references(() => transacoes.id, { onDelete: "set null" }),
    origem: text("origem").notNull(),
    idExterno: text("id_externo"),
    /** Status exatamente como a origem informou (ex.: RECEIVED, OVERDUE). */
    statusOriginal: text("status_original"),
    link: text("link"),
    parcelaAtual: integer("parcela_atual"),
    parcelaTotal: integer("parcela_total"),
    dividaId: integer("divida_id").references(() => dividas.id, { onDelete: "cascade" }),
    recorrenciaId: integer("recorrencia_id").references(() => recorrencias.id, { onDelete: "cascade" }),
    /** Quando o lembrete pós-pagamento (ex.: enviar comprovante) foi cumprido. */
    lembreteCumpridoEm: timestamp("lembrete_cumprido_em", { withTimezone: true }),
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("compromissos_origem_idx").on(t.origem, t.idExterno),
    index("compromissos_vencimento_idx").on(t.vencimento),
  ],
);

/** Notas fiscais emitidas (receita bruta para o Simples e o Fator R). */
export const notasFiscais = pgTable(
  "notas_fiscais",
  {
    id: serial("id").primaryKey(),
    origem: text("origem").notNull(),
    idExterno: text("id_externo").notNull(),
    compromissoId: integer("compromisso_id").references(() => compromissos.id, { onDelete: "set null" }),
    clienteId: integer("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    numero: text("numero"),
    /** Status da origem: SCHEDULED, AUTHORIZED, CANCELED... */
    status: text("status").notNull(),
    valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
    dataEmissao: date("data_emissao").notNull(),
    codigoServico: text("codigo_servico"),
    descricaoServico: text("descricao_servico"),
    pdfUrl: text("pdf_url"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notas_origem_idx").on(t.origem, t.idExterno), index("notas_emissao_idx").on(t.dataEmissao)],
);

export type Compromisso = typeof compromissos.$inferSelect;
export type Divida = typeof dividas.$inferSelect;
export type Recorrencia = typeof recorrencias.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;

/** Consumo da IA por chamada, para acompanhar o custo (Configurações → Inteligência artificial). */
export const usoIa = pgTable(
  "uso_ia",
  {
    id: serial("id").primaryKey(),
    tarefa: text("tarefa").notNull(),
    modelo: text("modelo").notNull(),
    tokensEntrada: integer("tokens_entrada").notNull(),
    tokensSaida: integer("tokens_saida").notNull(),
    tokensCache: integer("tokens_cache").notNull().default(0),
    /** Custo estimado em milionésimos de dólar (pela tabela de preços em ia/cliente.ts). */
    custoMicroUsd: bigint("custo_micro_usd", { mode: "number" }).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uso_ia_criado_idx").on(t.criadoEm)],
);

/**
 * Faturas de cartão de crédito: vêm da importação da fatura (vencimento e total lidos do documento)
 * ou do lançamento manual. Cada fatura gera uma conta a pagar (`compromissoId`), que é quitada
 * quando o pagamento aparece no extrato da conta que paga o cartão.
 */
export const faturas = pgTable(
  "faturas",
  {
    id: serial("id").primaryKey(),
    contaId: integer("conta_id")
      .notNull()
      .references(() => contas.id, { onDelete: "cascade" }),
    vencimento: date("vencimento").notNull(),
    fechamento: date("fechamento"),
    /** Total a pagar (positivo). */
    valorCentavos: bigint("valor_centavos", { mode: "number" }).notNull(),
    minimoCentavos: bigint("minimo_centavos", { mode: "number" }),
    importacaoId: integer("importacao_id").references(() => importacoes.id, { onDelete: "set null" }),
    compromissoId: integer("compromisso_id").references(() => compromissos.id, { onDelete: "set null" }),
    origem: text("origem").notNull().default("importacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("faturas_conta_vencimento_idx").on(t.contaId, t.vencimento)],
);

export type Fatura = typeof faturas.$inferSelect;

/**
 * Cadastro público de empresas (CNPJ → atividade/CNAE), consultado na BrasilAPI e guardado aqui
 * para não repetir a consulta. Ajuda a classificar pagamentos a empresas. Só CNPJ: CPF nunca é consultado.
 */
export const empresas = pgTable("empresas", {
  cnpj: text("cnpj").primaryKey(),
  razaoSocial: text("razao_social"),
  nomeFantasia: text("nome_fantasia"),
  cnae: text("cnae"),
  cnaeDescricao: text("cnae_descricao"),
  /** "ok", "nao_encontrado" ou "erro" (erro é tentado de novo depois). */
  situacao: text("situacao").notNull().default("ok"),
  consultadoEm: timestamp("consultado_em", { withTimezone: true }).notNull().defaultNow(),
});
