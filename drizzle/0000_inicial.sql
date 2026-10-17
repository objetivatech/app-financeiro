CREATE TYPE "public"."escopo_conta" AS ENUM('PF', 'PJ', 'misto');--> statement-breakpoint
CREATE TYPE "public"."escopo" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."formato_arquivo" AS ENUM('ofx', 'csv', 'pdf', 'imagem');--> statement-breakpoint
CREATE TYPE "public"."natureza" AS ENUM('comum', 'transferencia_interna', 'retirada_socio', 'pro_labore', 'distribuicao_lucros', 'aporte_socio', 'despesa_pessoal_na_pj', 'despesa_pj_na_pf', 'pagamento_fatura', 'imposto', 'estorno', 'investimento');--> statement-breakpoint
CREATE TYPE "public"."origem_classificacao" AS ENUM('conta', 'regra', 'heuristica', 'transferencia', 'ia', 'usuario');--> statement-breakpoint
CREATE TYPE "public"."tipo_conta" AS ENUM('corrente', 'pagamento', 'poupanca', 'cartao_credito', 'investimento');--> statement-breakpoint
CREATE TABLE "analises" (
	"id" serial PRIMARY KEY NOT NULL,
	"periodo_inicio" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"conteudo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"escopo" "escopo",
	"grupo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" serial PRIMARY KEY NOT NULL,
	"instituicao_id" text,
	"instituicao_nome" text NOT NULL,
	"apelido" text NOT NULL,
	"tipo" "tipo_conta" DEFAULT 'corrente' NOT NULL,
	"agencia" text,
	"numero" text,
	"final_cartao" text,
	"titular_id" integer,
	"escopo_padrao" "escopo_conta" DEFAULT 'misto' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"candidata_encerrar" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"nome_arquivo" text NOT NULL,
	"hash_arquivo" text NOT NULL,
	"formato" "formato_arquivo" NOT NULL,
	"extraido_por" text NOT NULL,
	"periodo_inicio" date,
	"periodo_fim" date,
	"saldo_final_centavos" bigint,
	"qtd_novas" integer DEFAULT 0 NOT NULL,
	"qtd_duplicadas" integer DEFAULT 0 NOT NULL,
	"avisos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "importacoes_hash_arquivo_unique" UNIQUE("hash_arquivo")
);
--> statement-breakpoint
CREATE TABLE "regras" (
	"id" serial PRIMARY KEY NOT NULL,
	"padrao" text NOT NULL,
	"conta_id" integer,
	"escopo" "escopo",
	"categoria_id" text,
	"natureza" "natureza",
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titulares" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "escopo" NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"regime_tributario" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titulares_documento_unique" UNIQUE("documento")
);
--> statement-breakpoint
CREATE TABLE "transacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"importacao_id" integer,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"descricao_normalizada" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"id_externo" text,
	"hash_dedup" text NOT NULL,
	"nome_contraparte" text,
	"documento_contraparte" text,
	"parcela_atual" integer,
	"parcela_total" integer,
	"escopo" "escopo",
	"categoria_id" text,
	"natureza" "natureza" DEFAULT 'comum' NOT NULL,
	"classificado_por" "origem_classificacao",
	"confianca" real,
	"motivo" text,
	"par_transferencia_id" integer,
	"revisar" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_titular_id_titulares_id_fk" FOREIGN KEY ("titular_id") REFERENCES "public"."titulares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras" ADD CONSTRAINT "regras_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras" ADD CONSTRAINT "regras_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transacoes" ADD CONSTRAINT "transacoes_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contas_instituicao_idx" ON "contas" USING btree ("instituicao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transacoes_dedup_idx" ON "transacoes" USING btree ("conta_id","hash_dedup");--> statement-breakpoint
CREATE INDEX "transacoes_data_idx" ON "transacoes" USING btree ("data");--> statement-breakpoint
CREATE INDEX "transacoes_revisar_idx" ON "transacoes" USING btree ("revisar") WHERE "transacoes"."revisar" = true;