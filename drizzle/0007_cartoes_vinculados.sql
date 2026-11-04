CREATE TABLE "cartoes_vinculados" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"tipo" text DEFAULT 'virtual' NOT NULL,
	"apelido" text NOT NULL,
	"final" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"cancelado_em" date,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transacoes" ADD COLUMN "final_cartao" text;--> statement-breakpoint
ALTER TABLE "cartoes_vinculados" ADD CONSTRAINT "cartoes_vinculados_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cartoes_vinculados_final_idx" ON "cartoes_vinculados" USING btree ("conta_id","final");