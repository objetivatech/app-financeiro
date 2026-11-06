import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, Valor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { indicadoresFiscais } from "@/lib/fiscal/indicadores";
import { INSS_PRO_LABORE, LIMITE_FATOR_R } from "@/lib/fiscal/simples";
import { contasFixasDeImposto, guiasPagasNoMes, impostosPorCompetencia } from "@/lib/fiscal/impostos-a-pagar";
import { hojeBrasil } from "@/lib/datas";
import { deslocarMes, formatarData, formatarMes, formatarMoeda } from "@/lib/formato";

export default function PaginaImpostos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Impostos e Fator R <LinkAjuda secao="impostos" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Estimativa do Simples Nacional a partir das notas emitidas. O valor oficial do DAS é o que a contabilidade
          calcula no PGDAS-D; use esta tela para planejar.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const pct = (v: number, casas = 1) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;

async function Conteudo() {
  await connection();
  const ind = await indicadoresFiscais(obterDb());
  const d = ind.diagnostico;
  const { perfil } = ind;

  if (ind.mesesComDados === 0 && ind.receitaMesAtualCentavos === 0) {
    return (
      <Cartao>
        <p className="text-sm text-suave">
          Ainda não há receita registrada. <Link href="/integracoes" className="underline">Conecte o Asaas</Link> para
          trazer as notas fiscais dos últimos 12 meses.
        </p>
      </Cartao>
    );
  }

  const folga = d.receitaMensalMaximaCentavos - Math.round(d.rbt12Centavos / 12);
  const economiaMensal = d.dasNoOutroAnexoCentavos - d.dasEstimadoCentavos;

  return (
    <>
      {perfil.proLaboreMensalCentavos === 0 && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          Cadastre seu pró-labore em <Link href="/configuracoes" className="underline">Configurações</Link> para calcular o
          Fator R.
        </p>
      )}
      {(ind.meiAte || ind.folhaCompletaEm) && (
        <div className="rounded-md border border-borda bg-superficie p-3 text-sm">
          <p>
            <strong>Enquadramento:</strong>{" "}
            {ind.meiAte ? (
              <>
                MEI até {formatarMes(ind.meiAte)}; ME no Simples Nacional desde {formatarMes(deslocarMes(ind.meiAte, 1))}.
              </>
            ) : (
              "ME/EPP no Simples Nacional."
            )}{" "}
            <Link href="/configuracoes#enquadramento" className="underline">alterar</Link>
          </p>
          {ind.folhaCompletaEm && (
            <p className="mt-1 text-suave">
              A folha tem pró-labore em {ind.mesesDeFolha} dos últimos 12 meses (MEI não tem pró-labore). Até completar 12 meses — em{" "}
              {formatarMes(ind.folhaCompletaEm)} — o Fator R usa a média mensal da folha × 12 (no primeiro mês, a folha do próprio mês ×
              12), como o PGDAS-D apurou o seu DAS de set/2026 (Anexo III). Com o pró-labore atual, isso dá{" "}
              <strong className="text-foreground">{pct(ind.fatorRPleno)}</strong>. A receita do período MEI entra na RBT12 (mesmo CNPJ).
            </p>
          )}
        </div>
      )}
      {ind.regimeAtual === "mei" && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          Este mês a empresa está como MEI: o DAS é o valor fixo do MEI, não o percentual do Simples. Os cálculos abaixo valem só a partir
          do mês em que ela passa a ser ME.
        </p>
      )}
      {ind.mesesComDados < 12 && (
        <p className="rounded-md border border-borda bg-superficie p-3 text-sm text-suave">
          Só há receita registrada em {ind.mesesComDados} dos últimos 12 meses. Enquanto o histórico não estiver completo, a
          RBT12 e o Fator R ficam distorcidos.
        </p>
      )}

      <ImpostosAPagar />

      <div className="grid gap-3 md:grid-cols-3">
        <Cartao titulo="Fator R (últimos 12 meses)">
          <div className={`text-2xl font-semibold ${d.fatorR >= LIMITE_FATOR_R ? "text-positivo" : "text-negativo"}`}>{pct(d.fatorR)}</div>
          <div className="mt-1 text-xs text-suave">
            {d.fatorR >= LIMITE_FATOR_R ? "acima de 28%: tributa pelo Anexo III" : "abaixo de 28%: tributa pelo Anexo V (mais caro)"}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-suave">Folha 12 meses ({ind.mesesDeFolha === 12 ? "pró-labore × 12" : `média de ${Math.max(ind.mesesDeFolha, 1)} mês(es) × 12`})</dt>
            <dd className="text-right"><Valor centavos={d.folha12Centavos} /></dd>
            <dt className="text-suave">Receita 12 meses (RBT12)</dt>
            <dd className="text-right"><Valor centavos={d.rbt12Centavos} /></dd>
          </dl>
        </Cartao>
        <Cartao titulo={`DAS estimado de ${new Date().toLocaleString("pt-BR", { month: "long" })}`}>
          <div className="text-2xl font-semibold"><Valor centavos={d.dasEstimadoCentavos} /></div>
          <div className="mt-1 text-xs text-suave">
            Anexo {d.anexo}, alíquota efetiva {pct(d.aliquotaEfetiva, 2)} sobre <Valor centavos={ind.receitaMesAtualCentavos} /> faturados
            até agora
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-suave">INSS do pró-labore (11%)</dt>
            <dd className="text-right"><Valor centavos={Math.round(perfil.proLaboreMensalCentavos * INSS_PRO_LABORE)} /></dd>
            <dt className="text-suave">No Anexo {d.anexo === "III" ? "V" : "III"} seria</dt>
            <dd className="text-right"><Valor centavos={d.dasNoOutroAnexoCentavos} /></dd>
          </dl>
        </Cartao>
        <Cartao titulo="Margem para crescer">
          {perfil.proLaboreMensalCentavos > 0 ? (
            <>
              <div className={`text-2xl font-semibold ${folga < 0 ? "text-negativo" : ""}`}>
                <Valor centavos={d.receitaMensalMaximaCentavos} />
              </div>
              <div className="mt-1 text-xs text-suave">
                receita média mensal máxima para manter o Fator R com pró-labore de {formatarMoeda(perfil.proLaboreMensalCentavos)}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
                <dt className="text-suave">Pró-labore mínimo hoje</dt>
                <dd className="text-right"><Valor centavos={d.proLaboreMinimoCentavos} /></dd>
                <dt className="text-suave">Média atual</dt>
                <dd className="text-right"><Valor centavos={Math.round(d.rbt12Centavos / 12)} /></dd>
              </dl>
            </>
          ) : (
            <p className="text-sm text-suave">Cadastre o pró-labore para calcular.</p>
          )}
        </Cartao>
      </div>

      {d.anexo === "III" && economiaMensal > 0 && (
        <p className="text-sm text-suave">
          Manter o Fator R acima de 28% está economizando cerca de <strong className="text-foreground">{formatarMoeda(economiaMensal)}</strong>{" "}
          de DAS neste mês em relação ao Anexo V.
          {folga < 0 && " Atenção: sua receita média já passou do limite; considere ajustar o pró-labore."}
        </p>
      )}

      <Cartao titulo="Receita bruta por mês">
        <BarrasMensais titulo="" cor="pj" dados={ind.receitaMensal.map((m) => ({ mes: m.mes, valor: m.valorCentavos }))} />
        <p className="mt-3 text-xs text-suave">
          Fonte:{" "}
          {ind.fonte === "notas"
            ? "notas fiscais autorizadas."
            : ind.fonte === "misto"
              ? "notas fiscais autorizadas; nos meses sem nota, cobranças recebidas."
              : "cobranças recebidas (não há notas fiscais sincronizadas)."}{" "}
          O último mês é o atual, ainda em andamento.
        </p>
      </Cartao>
    </>
  );
}

const SITUACAO_TOM = { pago: "text-positivo", aberto: "text-suave", vencido: "text-negativo", andamento: "text-alerta" } as const;

/** DAS + INSS por competência (mês das notas), com vencimento no dia 20 do mês seguinte. */
async function ImpostosAPagar() {
  const db = obterDb();
  const [lista, fixas] = await Promise.all([impostosPorCompetencia(db, 6), contasFixasDeImposto(db)]);
  const hoje = hojeBrasil();
  const atual = hoje.slice(0, 7);
  // Competências antigas sem conta a pagar: confere o que saiu de guia no extrato do mês do vencimento.
  const extrato = new Map(
    await Promise.all(
      lista.filter((c) => !c.dasPago && !c.inssPago && c.vencimento < hoje).map(async (c) => [c.competencia, await guiasPagasNoMes(db, c.vencimento.slice(0, 7))] as const),
    ),
  );
  const linhas = lista.map((c) => {
    const estimado = (c.dasCentavos ?? 0) + c.inssCentavos;
    const pagoReal = (c.dasPago?.valorCentavos ?? 0) + (c.inssPago?.valorCentavos ?? 0);
    const noExtrato = extrato.get(c.competencia);
    const pagoExtrato = noExtrato ? noExtrato.das + noExtrato.inss : 0;
    const situacao: keyof typeof SITUACAO_TOM =
      c.competencia === atual ? "andamento" : pagoReal > 0 || pagoExtrato > 0 ? "pago" : c.vencimento < hoje ? "vencido" : "aberto";
    return { ...c, estimado, pago: pagoReal || pagoExtrato, situacao };
  });
  const proxima = linhas.find((l) => l.competencia < atual && l.vencimento >= hoje && l.situacao !== "pago");
  const andamento = linhas.find((l) => l.competencia === atual);

  return (
    <Cartao titulo={<>Impostos a pagar (dia 20) <LinkAjuda secao="impostos-a-pagar" /></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs text-suave">Próximo vencimento</div>
          {proxima ? (
            <>
              <div className="text-2xl font-semibold">
                <Valor centavos={proxima.estimado} />
              </div>
              <div className="text-xs text-suave">
                em {formatarData(proxima.vencimento)} · competência {formatarMes(proxima.competencia)}: DAS{" "}
                {proxima.dasCentavos === null ? "fixo do MEI" : formatarMoeda(proxima.dasCentavos)} + INSS {formatarMoeda(proxima.inssCentavos)}
              </div>
            </>
          ) : (
            <div className="text-sm text-suave">Nada pendente da competência passada.</div>
          )}
        </div>
        {andamento && (
          <div>
            <div className="text-xs text-suave">Já acumulado para {formatarData(andamento.vencimento)}</div>
            <div className="text-2xl font-semibold">
              <Valor centavos={andamento.estimado} />
            </div>
            <div className="text-xs text-suave">
              {formatarMes(andamento.competencia)} ainda em andamento: cresce a cada nota emitida ({andamento.quantidadeNotas} até agora).
            </div>
          </div>
        )}
      </div>

      {fixas.length > 0 && (
        <p className="mt-3 rounded-md border border-alerta/40 bg-alerta/10 p-2 text-xs">
          Você tem conta fixa para {fixas.map((f) => `"${f.descricao}"`).join(", ")} em A pagar. Enquanto ela existir, o app não lança a estimativa
          pelas notas para esse imposto (contaria em dobro). Para usar a estimativa, encerre a conta fixa em{" "}
          <Link href="/pagar" className="underline">A pagar</Link>.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="py-1 pr-2 font-medium">Competência</th>
              <th className="py-1 pr-2 text-right font-medium">Receita (notas)</th>
              <th className="py-1 pr-2 font-medium">Alíquota</th>
              <th className="py-1 pr-2 text-right font-medium">DAS</th>
              <th className="py-1 pr-2 text-right font-medium">INSS</th>
              <th className="py-1 pr-2 text-right font-medium">Total</th>
              <th className="py-1 pr-2 font-medium">Vence</th>
              <th className="py-1 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {[...linhas].reverse().map((l) => (
              <tr key={l.competencia} className="border-t border-borda align-top">
                <td className="py-1 pr-2">{formatarMes(l.competencia)}</td>
                <td className="py-1 pr-2 text-right">
                  <Valor centavos={l.receitaCentavos} />
                  <div className="text-xs text-suave">{l.quantidadeNotas} nota(s)</div>
                </td>
                <td className="py-1 pr-2 text-xs">
                  {l.regime === "mei" ? (
                    "MEI (valor fixo)"
                  ) : (
                    <>
                      Anexo {l.anexo} · {pct(l.aliquotaEfetiva ?? 0, 2)}
                      <div className="text-suave">
                        RBT12 {formatarMoeda(l.rbt12Centavos)}
                        {l.fatorR !== null && ` · Fator R ${pct(l.fatorR)}`}
                      </div>
                      {l.issRetidoDeduzidoCentavos > 0 && <div className="text-suave">− ISS retido {formatarMoeda(l.issRetidoDeduzidoCentavos)}</div>}
                    </>
                  )}
                </td>
                <td className="py-1 pr-2 text-right">{l.dasCentavos === null ? "—" : <Valor centavos={l.dasCentavos} />}</td>
                <td className="py-1 pr-2 text-right">
                  <Valor centavos={l.inssCentavos} />
                </td>
                <td className="py-1 pr-2 text-right font-medium">
                  <Valor centavos={l.estimado} />
                </td>
                <td className="py-1 pr-2">{formatarData(l.vencimento)}</td>
                <td className={`py-1 text-xs ${SITUACAO_TOM[l.situacao]}`}>
                  {l.situacao === "pago"
                    ? `pago ${formatarMoeda(l.pago)}${l.estimado ? ` (estimado ${formatarMoeda(l.estimado)}; diferença ${formatarMoeda(l.pago - l.estimado)})` : ""}`
                    : l.situacao === "andamento"
                      ? "mês em andamento"
                      : l.situacao === "vencido"
                        ? "sem pagamento encontrado"
                        : "a pagar"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-suave">
        Competência é o mês das notas; o imposto vence no dia 20 do mês seguinte (antes, se cair em fim de semana ou feriado). DAS =
        receita do mês × alíquota efetiva (RBT12 dos 12 meses anteriores e anexo pelo Fator R daquele mês); nas notas com ISS retido pelo
        cliente, a parte do ISS sai do DAS. INSS = 11% do pró-labore. Os valores entram em{" "}
        <Link href="/pagar" className="underline">A pagar</Link> e no fluxo de caixa e dão baixa quando a guia aparece no extrato
        (o valor real substitui a estimativa). O oficial é o PGDAS-D da contabilidade.
      </p>
    </Cartao>
  );
}
