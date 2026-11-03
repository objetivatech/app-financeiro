CREATE TYPE "public"."status_compromisso" AS ENUM('aberto', 'vencido', 'pago', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_compromisso" AS ENUM('receber', 'pagar');--> statement-breakpoint
ALTER TYPE "public"."formato_arquivo" ADD VALUE 'api';--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"origem" text NOT NULL,
	"id_externo" text NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"email" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compromissos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_compromisso" NOT NULL,
	"escopo" "escopo" NOT NULL,
	"descricao" text NOT NULL,
	"cliente_id" integer,
	"valor_centavos" bigint NOT NULL,
	"valor_liquido_centavos" bigint,
	"vencimento" date NOT NULL,
	"status" "status_compromisso" DEFAULT 'aberto' NOT NULL,
	"data_pagamento" date,
	"data_credito" date,
	"forma_pagamento" text,
	"categoria_id" text,
	"conta_id" integer,
	"transacao_id" integer,
	"origem" text NOT NULL,
	"id_externo" text,
	"status_original" text,
	"link" text,
	"parcela_atual" integer,
	"parcela_total" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integracoes" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'nunca' NOT NULL,
	"mensagem" text,
	"ultima_sincronizacao" timestamp with time zone,
	"extrato_ate" date,
	"conta_id" integer,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas_fiscais" (
	"id" serial PRIMARY KEY NOT NULL,
	"origem" text NOT NULL,
	"id_externo" text NOT NULL,
	"compromisso_id" integer,
	"cliente_id" integer,
	"numero" text,
	"status" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"data_emissao" date NOT NULL,
	"codigo_servico" text,
	"descricao_servico" text,
	"pdf_url" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_transacao_id_transacoes_id_fk" FOREIGN KEY ("transacao_id") REFERENCES "public"."transacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes" ADD CONSTRAINT "integracoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_compromisso_id_compromissos_id_fk" FOREIGN KEY ("compromisso_id") REFERENCES "public"."compromissos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_origem_idx" ON "clientes" USING btree ("origem","id_externo");--> statement-breakpoint
CREATE UNIQUE INDEX "compromissos_origem_idx" ON "compromissos" USING btree ("origem","id_externo");--> statement-breakpoint
CREATE INDEX "compromissos_vencimento_idx" ON "compromissos" USING btree ("vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_origem_idx" ON "notas_fiscais" USING btree ("origem","id_externo");--> statement-breakpoint
CREATE INDEX "notas_emissao_idx" ON "notas_fiscais" USING btree ("data_emissao");