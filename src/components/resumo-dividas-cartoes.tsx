import Link from "next/link";
import { Cartao, Valor } from "@/components/ui";
import type { ResumoCartao } from "@/lib/cartoes/servico";
import type { ResumoDivida } from "@/lib/compromissos/servico";
import { formatarData, formatarPercentual } from "@/lib/formato";

/** Quadro curto de dívidas e cartões de um escopo (PF ou PJ), com links para as telas completas. */
export function ResumoDividasCartoes({ dividas, cartoes }: { dividas: ResumoDivida[]; cartoes: ResumoCartao[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Cartao titulo="Dívidas e parcelamentos">
        {dividas.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma dívida cadastrada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {dividas.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span>
                  {d.nome}{" "}
                  <span className="text-xs text-suave">
                    {d.parcelasPagas}/{d.parcelasTotal}
                    {d.proximaParcela && ` · próxima ${formatarData(d.proximaParcela.vencimento)}`}
                    {d.diasAtraso > 0 && <span className="text-negativo"> · {d.diasAtraso} dia(s) de atraso</span>}
                  </span>
                </span>
                <span className="text-right">
                  <Valor centavos={d.restanteCentavos} />
                  <span className="block text-xs text-suave">restante</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/pagar" className="mt-3 inline-block text-xs underline">
          ver A pagar e dívidas
        </Link>
      </Cartao>
      <Cartao titulo="Cartões de crédito">
        {cartoes.length === 0 ? (
          <p className="text-sm text-suave">Nenhum cartão deste lado.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {cartoes.map((c) => (
              <li key={c.conta.id} className="flex justify-between gap-2">
                <span>
                  {c.conta.apelido}
                  <span className="block text-xs text-suave">
                    {c.faturaAberta ? <>fatura de {formatarData(c.faturaAberta.vencimento)}</> : "sem fatura em aberto"}
                    {c.conta.limiteCentavos ? ` · ${formatarPercentual(c.limiteUsadoCentavos / c.conta.limiteCentavos, 0)} do limite` : ""}
                    {c.encargos3mCentavos > 0 && <span className="text-negativo"> · pagou juros/encargos</span>}
                  </span>
                </span>
                <span className="text-right">
                  <Valor centavos={c.faturaAberta?.valorCentavos ?? 0} />
                  <span className="block text-xs text-suave">+ <Valor centavos={c.parceladoAVencerCentavos} /> parcelado</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/cartoes" className="mt-3 inline-block text-xs underline">
          ver Cartões
        </Link>
      </Cartao>
    </div>
  );
}
