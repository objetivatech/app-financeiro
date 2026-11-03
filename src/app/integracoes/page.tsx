import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, Valor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { integracoes } from "@/lib/db/schema";
import { asaasConfigurado } from "@/lib/integracoes/asaas/cliente";
import { asaasSincronizando, type ResumoSincronizacao } from "@/lib/integracoes/asaas/sincronizar";
import { formatarData } from "@/lib/formato";
import { BotaoSincronizar } from "./botao-sincronizar";

export default function PaginaIntegracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Integrações <LinkAjuda secao="integracoes" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Conexões diretas com os serviços que você usa: os dados chegam sozinhos, sem importar arquivos.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Asaas />
      </Suspense>
      <Cartao titulo="Mercado Pago">
        <p className="text-sm text-suave">Em breve: recebimentos ocasionais e empréstimos do Mercado Crédito.</p>
      </Cartao>
    </div>
  );
}

const ROTULO_STATUS: Record<string, string> = {
  nunca: "nunca sincronizado",
  sincronizando: "sincronizando…",
  ok: "funcionando",
  erro: "com erro",
};

async function Asaas() {
  await connection();
  const db = obterDb();
  const linha = await db.query.integracoes.findFirst({ where: eq(integracoes.id, "asaas") });
  const configurado = asaasConfigurado();
  const sincronizando = asaasSincronizando() || linha?.status === "sincronizando";
  const resumo = (linha?.dados as { ultimoResumo?: ResumoSincronizacao; saldoCentavos?: number | null } | undefined) ?? {};
  const status = linha?.status ?? "nunca";

  return (
    <Cartao titulo="Asaas (conta PJ, cobranças e notas fiscais)">
      {!configurado ? (
        <div className="space-y-2 text-sm">
          <p>Ainda não conectado. Para conectar:</p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              No Asaas, abra <strong>Minha conta → Integrações → Chave de API</strong> e gere uma chave de produção.
            </li>
            <li>
              Na VPS, adicione ao arquivo <code>.env</code>: <code>ASAAS_API_KEY=sua_chave</code> (a chave começa com{" "}
              <code>$aact_</code>; no <code>.env</code>, coloque-a entre aspas simples por causa do <code>$</code>).
            </li>
            <li>
              Rode <code>docker compose up -d</code> e volte aqui.
            </li>
          </ol>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
            <dt className="text-suave">Situação</dt>
            <dd className={status === "erro" ? "text-negativo" : status === "ok" ? "text-positivo" : ""}>
              {sincronizando ? ROTULO_STATUS.sincronizando : ROTULO_STATUS[status] ?? status}
            </dd>
            <dt className="text-suave">Última sincronização</dt>
            <dd>{linha?.ultimaSincronizacao ? linha.ultimaSincronizacao.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</dd>
            <dt className="text-suave">Saldo no Asaas</dt>
            <dd>{resumo.saldoCentavos != null ? <Valor centavos={resumo.saldoCentavos} /> : "—"}</dd>
            <dt className="text-suave">Extrato trazido até</dt>
            <dd>{linha?.extratoAte ? formatarData(linha.extratoAte) : "—"}</dd>
          </dl>
          {status === "erro" && linha?.mensagem && <p className="text-negativo">{linha.mensagem}</p>}
          {resumo.ultimoResumo && (
            <p className="text-suave">
              Última vez: {resumo.ultimoResumo.cobrancas} cobranças, {resumo.ultimoResumo.notas} notas,{" "}
              {resumo.ultimoResumo.lancamentosNovos} lançamentos novos no extrato, {resumo.ultimoResumo.conciliados} recebimentos
              conciliados.
              {resumo.ultimoResumo.avisos.length > 0 && <> Avisos: {resumo.ultimoResumo.avisos.slice(0, 3).join(" ")}</>}
            </p>
          )}
          <BotaoSincronizar sincronizando={sincronizando} desativado={!configurado} />
          <p className="text-xs text-suave">
            A sincronização também roda sozinha a cada 6 horas. Ela só lê dados: o app nunca cria cobranças nem move
            dinheiro no Asaas.
          </p>
        </div>
      )}
    </Cartao>
  );
}
