import { connection } from "next/server";
import { JanelaAvisos } from "@/components/janela-avisos";
import { alertasParaJanela, atualizarAlertasSeNecessario, contarAlertasAtivos } from "@/lib/consultor/alertas";
import { obterDb } from "@/lib/db";
import type { Alerta } from "@/lib/db/schema";

async function carregarJanela(): Promise<Alerta[]> {
  try {
    const db = obterDb();
    await atualizarAlertasSeNecessario(db);
    return await alertasParaJanela(db);
  } catch (erro) {
    console.error("Avisos indisponíveis", erro);
    return [];
  }
}

/** Roda as regras (no máximo a cada 10 min) e abre a janela com avisos novos importantes. */
export async function AvisosGlobais() {
  await connection();
  if (!process.env.DATABASE_URL) return null;
  const lista = await carregarJanela();
  return (
    <JanelaAvisos
      avisos={lista.map((a) => ({ id: a.id, gravidade: a.gravidade, titulo: a.titulo, mensagem: a.mensagem, recomendacao: a.recomendacao, link: a.link, pergunta: a.pergunta }))}
    />
  );
}

/** Número de avisos ativos ao lado do link "Avisos" no menu. */
export async function ContadorAvisos() {
  await connection();
  if (!process.env.DATABASE_URL) return null;
  const contagem = await contarAlertasAtivos(obterDb()).catch(() => ({ total: 0, criticos: 0 }));
  if (contagem.total === 0) return null;
  return (
    <span
      className={`rounded-full px-1.5 text-[11px] font-medium ${contagem.criticos > 0 ? "bg-negativo text-background" : "bg-foreground/10 text-foreground"}`}
      title={contagem.criticos > 0 ? `${contagem.criticos} urgente(s)` : undefined}
    >
      {contagem.total}
    </span>
  );
}
