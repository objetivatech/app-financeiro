CREATE TABLE "empresas" (
	"cnpj" text PRIMARY KEY NOT NULL,
	"razao_social" text,
	"nome_fantasia" text,
	"cnae" text,
	"cnae_descricao" text,
	"situacao" text DEFAULT 'ok' NOT NULL,
	"consultado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faturas" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"vencimento" date NOT NULL,
	"fechamento" date,
	"valor_centavos" bigint NOT NULL,
	"minimo_centavos" bigint,
	"importacao_id" integer,
	"compromisso_id" integer,
	"origem" text DEFAULT 'importacao' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "dia_fechamento" integer;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "dia_vencimento" integer;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "limite_centavos" bigint;--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "conta_pagamento_id" integer;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_importacao_id_importacoes_id_fk" FOREIGN KEY ("importacao_id") REFERENCES "public"."importacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_compromisso_id_compromissos_id_fk" FOREIGN KEY ("compromisso_id") REFERENCES "public"."compromissos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "faturas_conta_vencimento_idx" ON "faturas" USING btree ("conta_id","vencimento");