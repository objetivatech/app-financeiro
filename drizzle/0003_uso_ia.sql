CREATE TABLE "uso_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"tarefa" text NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer NOT NULL,
	"tokens_saida" integer NOT NULL,
	"tokens_cache" integer DEFAULT 0 NOT NULL,
	"custo_micro_usd" bigint NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "uso_ia_criado_idx" ON "uso_ia" USING btree ("criado_em");