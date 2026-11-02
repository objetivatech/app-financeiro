import { obterDb } from "@/lib/db";
import { enfileirar, estadoFila, situacaoDosTrabalhos } from "@/lib/importacao/fila";

const TAMANHO_MAXIMO = 25 * 1024 * 1024;

/**
 * Recebe um arquivo e o coloca na fila; responde na hora com o id do trabalho.
 * A leitura (que pode usar IA por alguns minutos) acontece em segundo plano.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const arquivo = form.get("arquivo");
  const contaId = Number(form.get("contaId")) || undefined;
  if (!(arquivo instanceof File)) {
    return Response.json({ erro: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return Response.json({ erro: "Arquivo maior que 25 MB." }, { status: 413 });
  }
  const id = await enfileirar(obterDb(), new Uint8Array(await arquivo.arrayBuffer()), arquivo.name, contaId);
  return Response.json({ id }, { status: 202 });
}

/** Situação dos trabalhos: GET /api/importar?ids=1,2,3 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
  const trabalhos = await situacaoDosTrabalhos(obterDb(), ids);
  return Response.json({ trabalhos, ...estadoFila() });
}
