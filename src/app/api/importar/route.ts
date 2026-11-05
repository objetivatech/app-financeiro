import { obterDb } from "@/lib/db";
import { cancelarFila, descartarTrabalho, enfileirar, estadoFila, informarSenha, situacaoDosTrabalhos } from "@/lib/importacao/fila";

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

/** Cancela a fila: o que não foi lido é descartado e a leitura em andamento é interrompida. */
export async function DELETE() {
  const cancelados = await cancelarFila(obterDb());
  return Response.json({ cancelados });
}

/**
 * PDF que pede senha: PATCH /api/importar { id, senha, lembrar } devolve o arquivo à fila;
 * { id, descartar: true } desiste dele. A senha não volta nas respostas nem aparece em logs.
 */
export async function PATCH(request: Request) {
  const corpo = (await request.json().catch(() => ({}))) as { id?: unknown; senha?: unknown; lembrar?: unknown; descartar?: unknown };
  const id = Number(corpo.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ erro: "Arquivo inválido." }, { status: 400 });
  const db = obterDb();
  if (corpo.descartar === true) {
    await descartarTrabalho(db, id);
    return Response.json({ ok: true });
  }
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  if (!senha) return Response.json({ erro: "Digite a senha." }, { status: 400 });
  const ok = await informarSenha(db, id, senha, corpo.lembrar === true);
  return ok ? Response.json({ ok: true }) : Response.json({ erro: "Este arquivo não está mais esperando senha. Recarregue a página." }, { status: 409 });
}
