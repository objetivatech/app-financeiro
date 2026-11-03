import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, Valor } from "@/components/ui";
import { atualizarCompromissos, fluxoProjetado, type SemanaFluxo } from "@/lib/compromissos/servico";
import { obterDb } from "@/lib/db";
import { formatarData } from "@/lib/formato";

export default function PaginaFluxo() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Fluxo de caixa projetado <LinkAjuda secao="fluxo" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Próximas 13 semanas: parte do saldo conhecido das contas e soma o que está previsto para entrar e sair.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const db = obterDb();
  await atualizarCompromissos(db);
  const fluxo = await fluxoProjetado(db, 13);
  const piorPJ = fluxo.semanas.reduce((m, s) => (s.PJ.saldo < m.PJ.saldo ? s : m), fluxo.semanas[0]);
  const piorPF = fluxo.semanas.reduce((m, s) => (s.PF.saldo < m.PF.saldo ? s : m), fluxo.semanas[0]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <Resumo titulo="Empresa (PJ)" inicial={fluxo.saldoInicial.PJ} pior={piorPJ} lado="PJ" final={fluxo.semanas.at(-1)!.PJ.saldo} />
        <Resumo titulo="Pessoal (PF)" inicial={fluxo.saldoInicial.PF} pior={piorPF} lado="PF" final={fluxo.semanas.at(-1)!.PF.saldo} />
      </div>
      {fluxo.contasSemSaldo > 0 && (
        <p className="text-xs text-suave">
          {fluxo.contasSemSaldo} conta(s) sem saldo conhecido ficaram de fora do saldo inicial (extratos em CSV e alguns
          PDFs não informam o saldo). Veja <Link href="/contas" className="underline">Contas</Link>.
        </p>
      )}
      <Cartao titulo="Semana a semana" className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="py-1 font-medium">Semana</th>
              <th className="py-1 text-right font-medium">PJ entra</th>
              <th className="py-1 text-right font-medium">PJ sai</th>
              <th className="py-1 text-right font-medium">Saldo PJ</th>
              <th className="py-1 text-right font-medium">PF entra</th>
              <th className="py-1 text-right font-medium">PF sai</th>
              <th className="py-1 text-right font-medium">Saldo PF</th>
            </tr>
          </thead>
          <tbody>
            {fluxo.semanas.map((s, i) => (
              <tr key={s.inicio} className="border-t border-borda">
                <td className="numero py-1.5 pr-2">
                  {formatarData(s.inicio).slice(0, 5)} – {formatarData(s.fim).slice(0, 5)}
                  {i === 0 && <span className="text-xs text-suave"> (inclui atrasados)</span>}
                </td>
                <td className="text-right text-suave"><Valor centavos={s.PJ.entradas} /></td>
                <td className="text-right text-suave"><Valor centavos={-s.PJ.saidas || 0} /></td>
                <td className={`text-right font-medium ${s.PJ.saldo < 0 ? "text-negativo" : ""}`}><Valor centavos={s.PJ.saldo} /></td>
                <td className="text-right text-suave"><Valor centavos={s.PF.entradas} /></td>
                <td className="text-right text-suave"><Valor centavos={-s.PF.saidas || 0} /></td>
                <td className={`text-right font-medium ${s.PF.saldo < 0 ? "text-negativo" : ""}`}><Valor centavos={s.PF.saldo} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>
      <p className="text-xs text-suave">
        Entra: cobranças em aberto do Asaas, contas fixas e avulsas a receber. Sai: parcelas de dívidas, contas fixas e
        avulsas a pagar. Gastos do dia a dia (mercado, cartão) só aparecem se forem cadastrados como conta fixa — por isso,
        trate o saldo projetado como teto, não como garantia.
      </p>
    </>
  );
}

function Resumo({ titulo, inicial, pior, final, lado }: { titulo: string; inicial: number; pior: SemanaFluxo; final: number; lado: "PJ" | "PF" }) {
  const minimo = pior[lado].saldo;
  return (
    <Cartao titulo={titulo}>
      <dl className="grid grid-cols-2 gap-1 text-sm">
        <dt className="text-suave">Saldo conhecido hoje</dt>
        <dd className="text-right"><Valor centavos={inicial} /></dd>
        <dt className="text-suave">Menor saldo previsto</dt>
        <dd className={`text-right font-medium ${minimo < 0 ? "text-negativo" : ""}`}>
          <Valor centavos={minimo} /> <span className="text-xs text-suave">({formatarData(pior.inicio).slice(0, 5)})</span>
        </dd>
        <dt className="text-suave">Em 13 semanas</dt>
        <dd className="text-right"><Valor centavos={final} /></dd>
      </dl>
      {minimo < 0 && (
        <p className="mt-2 text-xs text-negativo">
          O saldo fica negativo na semana de {formatarData(pior.inicio)}: antecipe recebimentos ou adie gastos.
        </p>
      )}
    </Cartao>
  );
}
