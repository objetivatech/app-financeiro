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
import { mercadoPagoConfigurado } from "@/lib/integracoes/mercadopago/cliente";
import { mercadoPagoSincronizando, type ResumoMercadoPago } from "@/lib/integracoes/mercadopago/sincronizar";
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
      <Suspense fallback={<Carregando />}>
        <MercadoPago />
      </Suspense>
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

async function MercadoPago() {
  await connection();
  const db = obterDb();
  const linha = await db.query.integracoes.findFirst({ where: eq(integracoes.id, "mercadopago") });
  const configurado = mercadoPagoConfigurado();
  const sincronizando = mercadoPagoSincronizando() || linha?.status === "sincronizando";
  const dados = (linha?.dados as { ultimoResumo?: ResumoMercadoPago } | undefined) ?? {};
  const resumo = dados.ultimoResumo;
  const status = linha?.status ?? "nunca";
  return (
    <Cartao titulo="Mercado Pago (recebimentos e extrato da conta)">
      {!configurado ? (
        <div className="space-y-2 text-sm">
          <p>Ainda não conectado. Para conectar:</p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              Entre em <strong>mercadopago.com.br/developers</strong> com a conta que quer acompanhar → <strong>Suas integrações</strong> →{" "}
              <strong>Criar aplicação</strong> (qualquer nome, ex.: “Financeiro”).
            </li>
            <li>
              Na aplicação, abra <strong>Credenciais de produção</strong> e copie o <strong>Access Token</strong> (começa com{" "}
              <code>APP_USR-</code>).
            </li>
            <li>
              Na VPS, adicione ao <code>.env</code>: <code>MERCADOPAGO_ACCESS_TOKEN=APP_USR-...</code> e rode <code>docker compose up -d</code>.
            </li>
          </ol>
          <p className="text-xs text-suave">
            Sem conectar, dá para importar o <strong>Relatório de Liberações</strong> (CSV) baixado do painel do Mercado Pago em Importar.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
            <dt className="text-suave">Situação</dt>
            <dd className={status === "erro" ? "text-negativo" : status === "ok" ? "text-positivo" : ""}>
              {sincronizando ? ROTULO_STATUS.sincronizando : (ROTULO_STATUS[status] ?? status)}
            </dd>
            <dt className="text-suave">Última sincronização</dt>
            <dd>{linha?.ultimaSincronizacao ? linha.ultimaSincronizacao.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</dd>
            <dt className="text-suave">Conta</dt>
            <dd>{resumo?.conta ?? "—"}</dd>
            <dt className="text-suave">Extrato trazido até</dt>
            <dd>{linha?.extratoAte ? formatarData(linha.extratoAte) : resumo?.relatorioPendente ? "gerando…" : "—"}</dd>
          </dl>
          {status === "erro" && linha?.mensagem && <p className="text-negativo">{linha.mensagem}</p>}
          {resumo && (
            <p className="text-suave">
              Última vez: {resumo.pagamentos} pagamento(s) recebido(s) atualizados, {resumo.lancamentosNovos} lançamento(s) novo(s) no extrato.
              {resumo.avisos.length > 0 && <> {resumo.avisos.slice(0, 2).join(" ")}</>}
            </p>
          )}
          <BotaoSincronizar sincronizando={sincronizando} desativado={!configurado} servico="mercadopago" />
          <p className="text-xs text-suave">
            Roda sozinha a cada 6 horas. Só lê: o app nunca cria cobranças nem move dinheiro. Empréstimos do Mercado Crédito não têm API:
            cadastre-os em A pagar → Nova dívida.
          </p>
        </div>
      )}
    </Cartao>
  );
}
