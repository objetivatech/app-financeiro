import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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

export const escopoEnum = pgEnum("escopo", ["PF", "PJ"]);
/** Escopo padrão de uma conta: "misto" quando a mesma conta é usada para PF e PJ. */
export const escopoContaEnum = pgEnum("escopo_conta", ["PF", "PJ", "misto"]);
export const tipoContaEnum = pgEnum("tipo_conta", ["corrente", "pagamento", "poupanca", "cartao_credito", "investimento"]);
export const formatoEnum = pgEnum("formato_arquivo", ["ofx", "csv", "pdf", "imagem"]);
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
