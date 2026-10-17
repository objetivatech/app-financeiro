import { classificarPendentes } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { ErroIa } from "@/lib/ia/cliente";
import { importarParaBanco } from "@/lib/importacao/persistir";
import { ErroImportacao } from "@/lib/importacao/tipos";

const TAMANHO_MAXIMO = 25 * 1024 * 1024;

/** Recebe um arquivo por vez (multipart), importa e classifica. */
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

  const db = obterDb();
  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const resultado = await importarParaBanco(db, bytes, arquivo.name, { contaId });
    const classificacao = await classificarPendentes(db);
    return Response.json({ ...resultado, classificacao });
  } catch (erro) {
    if (erro instanceof ErroImportacao || erro instanceof ErroIa) {
      return Response.json({ erro: erro.message }, { status: 422 });
    }
    console.error("Falha ao importar", arquivo.name, erro);
    return Response.json({ erro: "Erro inesperado ao importar. Veja os logs do servidor." }, { status: 500 });
  }
}
