CREATE TYPE "public"."status_trabalho" AS ENUM('fila', 'processando', 'concluido', 'erro');--> statement-breakpoint
CREATE TABLE "trabalhos_importacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome_arquivo" text NOT NULL,
	"conta_id" integer,
	"arquivo" "bytea",
	"status" "status_trabalho" DEFAULT 'fila' NOT NULL,
	"mensagem" text,
	"resultado" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"concluido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "trabalhos_importacao" ADD CONSTRAINT "trabalhos_importacao_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;