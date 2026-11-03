import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { connection } from "next/server";
import { Suspense } from "react";
import { Carregando } from "@/components/ui";

export default function PaginaAjuda() {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo />
    </Suspense>
  );
}

/** O manual e o changelog são os mesmos arquivos do repositório (docs/MANUAL.md e CHANGELOG.md). */
async function lerMarkdown(relativo: string): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), relativo), "utf8");
  } catch {
    return `_Arquivo ${relativo} não encontrado no servidor._`;
  }
}

async function Conteudo() {
  await connection();
  const [manual, changelog] = await Promise.all([lerMarkdown("docs/MANUAL.md"), lerMarkdown("CHANGELOG.md")]);
  // Conteúdo vem de arquivos do próprio repositório (não de usuários), por isso é seguro renderizar como HTML.
  const html = (await marked.parse(manual)) + '<a id="novidades"></a>' + (await marked.parse(changelog));
  return <article className="manual mx-auto max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />;
}
