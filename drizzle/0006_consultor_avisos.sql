CREATE TYPE "public"."gravidade_alerta" AS ENUM('info', 'atencao', 'critico');--> statement-breakpoint
CREATE TYPE "public"."status_alerta" AS ENUM('ativo', 'resolvido', 'dispensado');--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" text NOT NULL,
	"tipo" text NOT NULL,
	"gravidade" "gravidade_alerta" NOT NULL,
	"escopo" "escopo",
	"titulo" text NOT NULL,
	"mensagem" text NOT NULL,
	"recomendacao" text,
	"link" text,
	"pergunta" text,
	"transacao_id" integer,
	"status" "status_alerta" DEFAULT 'ativo' NOT NULL,
	"visto_em" timestamp with time zone,
	"adiado_ate" date,
	"resolvido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alertas_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens_consultor" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversa_id" integer NOT NULL,
	"papel" text NOT NULL,
	"texto" text NOT NULL,
	"ferramentas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_transacao_id_transacoes_id_fk" FOREIGN KEY ("transacao_id") REFERENCES "public"."transacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_consultor" ADD CONSTRAINT "mensagens_consultor_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_status_idx" ON "alertas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alertas_transacao_idx" ON "alertas" USING btree ("transacao_id");--> statement-breakpoint
CREATE INDEX "mensagens_conversa_idx" ON "mensagens_consultor" USING btree ("conversa_id");