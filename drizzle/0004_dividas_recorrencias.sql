CREATE TYPE "public"."tipo_divida" AS ENUM('acordo_judicial', 'emprestimo', 'parcelamento_imposto', 'financiamento', 'compra_parcelada', 'outro');--> statement-breakpoint
CREATE TABLE "dividas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"credor" text,
	"tipo" "tipo_divida" DEFAULT 'outro' NOT NULL,
	"escopo" "escopo" NOT NULL,
	"valor_recebido_centavos" bigint,
	"dias_tolerancia" integer,
	"consequencia_atraso" text,
	"lembrete_apos_pagar" text,
	"conta_id" integer,
	"observacao" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recorrencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"tipo" text DEFAULT 'pagar' NOT NULL,
	"escopo" "escopo" NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"dia_vencimento" integer NOT NULL,
	"categoria_id" text,
	"conta_id" integer,
	"padrao_extrato" text,
	"inicio" date NOT NULL,
	"fim" date,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compromissos" ADD COLUMN "divida_id" integer;--> statement-breakpoint
ALTER TABLE "compromissos" ADD COLUMN "recorrencia_id" integer;--> statement-breakpoint
ALTER TABLE "compromissos" ADD COLUMN "lembrete_cumprido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compromissos" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "dividas" ADD CONSTRAINT "dividas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_divida_id_dividas_id_fk" FOREIGN KEY ("divida_id") REFERENCES "public"."dividas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromissos" ADD CONSTRAINT "compromissos_recorrencia_id_recorrencias_id_fk" FOREIGN KEY ("recorrencia_id") REFERENCES "public"."recorrencias"("id") ON DELETE cascade ON UPDATE no action;