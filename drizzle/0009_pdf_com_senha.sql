ALTER TYPE "public"."status_trabalho" ADD VALUE 'senha';--> statement-breakpoint
ALTER TABLE "trabalhos_importacao" ADD COLUMN "senha" text;--> statement-breakpoint
ALTER TABLE "trabalhos_importacao" ADD COLUMN "lembrar_senha" boolean DEFAULT false NOT NULL;