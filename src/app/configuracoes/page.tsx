import { connection } from "next/server";
import { Suspense } from "react";
import { Botao, Cartao, Carregando, estiloCampo, SeloEscopo } from "@/components/ui";
import { CATEGORIAS_PADRAO } from "@/lib/classificacao/categorias";
import { obterPerfil } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { ROTULOS_NATUREZA } from "@/lib/formato";
import { iaDisponivel, MODELO_IA } from "@/lib/ia/cliente";
import { excluirRegra, salvarPerfil } from "./acoes";

const EXEMPLO_PERFIL = `Ex.: Sou sócio único de uma agência de marketing digital (Simples Nacional, Anexo III).
Faturamento médio de R$ 40 mil/mês. Tiro pró-labore de R$ 3.000 todo dia 5 e distribuo lucros quando sobra.
Pago Google Ads, Meta Ads e ferramentas (Canva, Notion) no cartão da empresa.
Moro com minha esposa; mercado e escola dos filhos são gastos pessoais.`;

export default function PaginaConfiguracoes() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const db = obterDb();
  const [perfil, listaRegras] = await Promise.all([
    obterPerfil(db),
    db.query.regras.findMany({ orderBy: (r, { desc }) => [desc(r.id)] }),
  ]);
  const nomeCategoria = new Map(CATEGORIAS_PADRAO.map((c) => [c.id, c.nome]));

  return (
    <>
      <Cartao titulo="Sobre você e sua empresa">
        <form action={salvarPerfil} className="space-y-3">
          <p className="text-sm text-suave">
            A IA usa este texto para classificar melhor e dar dicas que fazem sentido para o seu caso. Conte o que a
            empresa faz, o regime, como você se remunera e quais gastos costumam se misturar.
          </p>
          <textarea name="perfil" defaultValue={perfil} rows={6} placeholder={EXEMPLO_PERFIL} className={`${estiloCampo} w-full`} />
          <Botao type="submit">Salvar</Botao>
        </form>
      </Cartao>

      <Cartao titulo="Inteligência artificial">
        <p className="text-sm">
          {iaDisponivel() ? (
            <>
              Ativa, usando o modelo <code>{MODELO_IA}</code>.
            </>
          ) : (
            <>
              Desativada: defina <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code> do servidor.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-suave">
          O que é enviado: PDFs e imagens de extrato (para leitura), descrição/data/valor das transações (para
          classificar) e totais agregados (para as dicas). CPF/CNPJ não são enviados na classificação nem nas dicas.
        </p>
      </Cartao>

      <Cartao titulo={`Regras aprendidas (${listaRegras.length})`}>
        {listaRegras.length === 0 ? (
          <p className="text-sm text-suave">
            Nenhuma ainda. Ao corrigir uma transação, marque “Aplicar a todas que contêm…” para criar uma regra.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {listaRegras.map((r) => (
                <tr key={r.id} className="border-t border-borda first:border-0">
                  <td className="py-1.5 pr-2 font-mono text-xs">{r.padrao}</td>
                  <td className="pr-2">
                    <SeloEscopo escopo={r.escopo} />
                  </td>
                  <td className="pr-2">{r.categoriaId ? nomeCategoria.get(r.categoriaId) : ""}</td>
                  <td className="pr-2 text-suave">{r.natureza ? ROTULOS_NATUREZA[r.natureza] : ""}</td>
                  <td className="pr-2 text-xs text-suave">{r.contaId ? "só numa conta" : "todas as contas"}</td>
                  <td className="text-right">
                    <form action={excluirRegra}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-negativo underline">excluir</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}
