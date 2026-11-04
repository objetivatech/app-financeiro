import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CartaoAviso } from "@/components/aviso";
import { LinkAjuda } from "@/components/link-ajuda";
import { Botao, Cartao, Carregando } from "@/components/ui";
import { alertasResolvidosRecentes, atualizarAlertasSeNecessario, listarAlertasAtivos } from "@/lib/consultor/alertas";
import { obterDb } from "@/lib/db";
import { formatarData } from "@/lib/formato";
import { iaDisponivel } from "@/lib/ia/cliente";
import { verificarAgora } from "./acoes";
import { BotaoCarta } from "./botao-carta";

export default function PaginaAvisos() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Avisos do consultor <LinkAjuda secao="avisos" />
          </h1>
          <p className="mt-1 text-sm text-suave">
            O app acompanha cada transação e o fluxo do dinheiro e avisa o que merece atenção, com o que fazer. Os avisos somem
            sozinhos quando a situação se resolve.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={verificarAgora}>
            <Botao type="submit">Verificar agora</Botao>
          </form>
        </div>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const GRUPOS = [
  { gravidade: "critico", titulo: "Urgente" },
  { gravidade: "atencao", titulo: "Atenção" },
  { gravidade: "info", titulo: "Dicas e lembretes" },
] as const;

async function Conteudo() {
  await connection();
  const db = obterDb();
  await atualizarAlertasSeNecessario(db);
  const [ativos, resolvidos] = await Promise.all([listarAlertasAtivos(db), alertasResolvidosRecentes(db)]);

  return (
    <>
      {iaDisponivel() && (
        <div className="flex justify-end">
          <BotaoCarta />
        </div>
      )}
      {ativos.length === 0 && (
        <Cartao>
          <p className="text-sm">✓ Nenhum aviso agora. Continue importando os extratos para o consultor acompanhar.</p>
        </Cartao>
      )}
      {GRUPOS.map((g) => {
        const lista = ativos.filter((a) => a.gravidade === g.gravidade);
        if (lista.length === 0) return null;
        return (
          <section key={g.gravidade} className="space-y-2">
            <h2 className="text-sm font-medium text-suave">
              {g.titulo} ({lista.length})
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {lista.map((a) => (
                <CartaoAviso key={a.id} a={a} />
              ))}
            </div>
          </section>
        );
      })}
      {resolvidos.length > 0 && (
        <Cartao titulo="Resolvidos nos últimos 30 dias">
          <ul className="space-y-1 text-sm">
            {resolvidos.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span>✓ {a.titulo}</span>
                <span className="text-xs text-suave">{a.resolvidoEm ? formatarData(a.resolvidoEm.toISOString().slice(0, 10)) : ""}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      <p className="text-xs text-suave">
        Quer entender melhor algum aviso? Use “perguntar ao consultor” ou abra o <Link href="/consultor" className="underline">chat</Link>.
      </p>
    </>
  );
}
