import { BotaoEnviar, Formulario } from "@/components/formulario";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, estiloCampo, Indicador, SeloEscopo, Valor } from "@/components/ui";
import { resumoCartoes, type ResumoCartao } from "@/lib/cartoes/servico";
import { atualizarCompromissos } from "@/lib/compromissos/servico";
import { obterDb } from "@/lib/db";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { INSTITUICOES } from "@/lib/instituicoes/catalogo";
import { alternarCartaoVinculado, marcarFatura, novoVinculado, removerCartaoVinculado, removerFatura } from "./acoes";
import { hojeBrasil } from "@/lib/datas";
import { FormCartao, FormFatura } from "./formularios";

export default function PaginaCartoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Cartões de crédito <LinkAjuda secao="cartoes" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Cadastre cada cartão (fechamento, vencimento, limite) e envie as faturas. O app lê o total e o vencimento, lança a fatura
          em A pagar e projeta as parcelas que ainda vão cair.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const FONTE = { cartao: "crédito na fatura", conta: "saída no extrato" } as const;

/** Texto da situação de uma fatura registrada. */
function situacao(f: ResumoCartao["faturas"][number]): { texto: string; tom: string } {
  switch (f.status) {
    case "paga":
      return { texto: f.manual ? `paga (marcada por você em ${formatarData(f.pagaEm!)})` : `paga${f.pagaEm ? ` em ${formatarData(f.pagaEm)}` : ""}`, tom: "text-positivo" };
    case "parcial":
      return { texto: `paga em parte: ${formatarMoeda(f.pagoCentavos)} · faltam ${formatarMoeda(f.restanteCentavos)}`, tom: "text-alerta" };
    case "rolada":
      return { texto: `não quitada: ${formatarMoeda(f.restanteCentavos)} passaram para a fatura seguinte (com juros)`, tom: "text-alerta" };
    case "vencida":
      return { texto: "vencida, sem pagamento encontrado", tom: "text-negativo" };
    default:
      return { texto: "a pagar", tom: "text-suave" };
  }
}

async function Conteudo() {
  await connection();
  const db = obterDb();
  await atualizarCompromissos(db);
  const [cartoes, todasContas] = await Promise.all([
    resumoCartoes(db, 6),
    db.query.contas.findMany({ columns: { id: true, apelido: true, tipo: true }, orderBy: (c, { asc }) => [asc(c.apelido)] }),
  ]);
  const contasPagadoras = todasContas.filter((c) => c.tipo !== "cartao_credito");
  const emissores = INSTITUICOES.filter((i) => i.tipo !== "corretora").map((i) => ({ id: i.id, nome: i.nome }));
  const totalAberto = cartoes.reduce((s, c) => s + (c.faturaAberta?.valorCentavos ?? 0), 0);
  const totalParcelado = cartoes.reduce((s, c) => s + c.parceladoAVencerCentavos, 0);
  const limiteTotal = cartoes.reduce((s, c) => s + (c.conta.limiteCentavos ?? 0), 0);
  const usado = cartoes.filter((c) => c.conta.limiteCentavos).reduce((s, c) => s + c.limiteUsadoCentavos, 0);
  const encargos = cartoes.reduce((s, c) => s + c.encargos3mCentavos, 0);
  const semConfig = cartoes.filter((c) => !c.conta.diaVencimento || !c.conta.diaFechamento);

  return (
    <>
      {cartoes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador rotulo="Faturas em aberto" valor={formatarMoeda(totalAberto)} detalhe={`${cartoes.filter((c) => c.faturaAberta).length} cartão(ões)`} />
          <Indicador rotulo="Parcelado a vencer" valor={formatarMoeda(totalParcelado)} detalhe="compras parceladas que ainda vão cair" />
          <Indicador
            rotulo="Limite usado"
            valor={limiteTotal > 0 ? formatarPercentual(usado / limiteTotal, 0) : "—"}
            detalhe={limiteTotal > 0 ? `${formatarMoeda(usado)} de ${formatarMoeda(limiteTotal)} · ideal: até 30%` : "informe o limite dos cartões"}
            tom={limiteTotal > 0 ? (usado / limiteTotal <= 0.3 ? "bom" : usado / limiteTotal <= 0.7 ? "atencao" : "ruim") : undefined}
          />
          <Indicador
            rotulo="Juros e encargos (3 meses)"
            valor={formatarMoeda(encargos)}
            detalhe={encargos > 0 ? "juros, IOF, multa ou anuidade: dá para zerar" : "nenhum encargo encontrado"}
            tom={encargos > 0 ? "ruim" : "bom"}
          />
        </div>
      )}
      {semConfig.length > 0 && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          ⚠ Complete o dia de fechamento e de vencimento de: {semConfig.map((c) => c.conta.apelido).join(", ")}. Sem isso, as parcelas
          de faturas sem vencimento (ex.: OFX) não entram na projeção.
        </p>
      )}

      {cartoes.map((c) => (
        <CartaoDetalhe key={c.conta.id} c={c} contas={contasPagadoras} emissores={emissores} />
      ))}

      <div className="grid gap-3 lg:grid-cols-2">
        <Cartao titulo="Cadastrar cartão">
          <FormCartao contas={contasPagadoras} emissores={emissores} />
        </Cartao>
        {cartoes.length > 0 && (
          <Cartao titulo="Lançar fatura à mão">
            <p className="mb-3 text-sm text-suave">
              Prefira <strong>enviar o PDF</strong> (botão “Enviar fatura” em cada cartão): assim entram também as compras e as
              parcelas. Use este formulário quando não tiver o arquivo.
            </p>
            <FormFatura cartoes={cartoes.map((c) => ({ id: c.conta.id, apelido: c.conta.apelido }))} />
          </Cartao>
        )}
      </div>
    </>
  );
}

function CartaoDetalhe({ c, contas, emissores }: { c: ResumoCartao; contas: { id: number; apelido: string }[]; emissores: { id: string; nome: string }[] }) {
  const k = c.conta;
  const usoLimite = k.limiteCentavos ? c.limiteUsadoCentavos / k.limiteCentavos : null;
  return (
    <Cartao>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            {k.apelido} <SeloEscopo escopo={k.escopoPadrao} />
          </div>
          <div className="text-xs text-suave">
            {k.instituicaoNome}
            {k.finalCartao && ` · final ${k.finalCartao}`}
            {k.diaFechamento && ` · fecha dia ${k.diaFechamento}`}
            {k.diaVencimento && ` · vence dia ${k.diaVencimento}`}
            {c.contaPagamentoApelido && ` · pago por ${c.contaPagamentoApelido}`}
          </div>
        </div>
        <Link href={`/importar?conta=${k.id}`} className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background">
          Enviar fatura
        </Link>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-suave">Fatura em aberto</span>
            <span>
              {c.faturaAberta ? (
                <>
                  <Valor centavos={c.faturaAberta.valorCentavos} />{" "}
                  <span className={`text-xs ${c.faturaAberta.vencimento < hojeBrasil() ? "text-negativo" : "text-suave"}`}>
                    {c.faturaAberta.vencimento < hojeBrasil() ? "vencida" : "vence"} {formatarData(c.faturaAberta.vencimento)}
                    {c.faturaAberta.pagoCentavos > 0 && ` · já pago ${formatarMoeda(c.faturaAberta.pagoCentavos)} de ${formatarMoeda(c.faturaAberta.totalCentavos)}`}
                  </span>
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-suave">Parcelado a vencer</span>
            <Valor centavos={c.parceladoAVencerCentavos} />
          </div>
          <div className="flex justify-between">
            <span className="text-suave">Limite usado</span>
            <span>
              {usoLimite === null ? "—" : formatarPercentual(usoLimite, 0)}
              {k.limiteCentavos ? <span className="text-xs text-suave"> de {formatarMoeda(k.limiteCentavos)}</span> : null}
            </span>
          </div>
          {usoLimite !== null && (
            <div className="h-1.5 rounded-full bg-foreground/5" title={`${formatarPercentual(usoLimite, 0)} do limite`}>
              <div className={`h-1.5 rounded-full ${usoLimite > 0.7 ? "bg-negativo" : usoLimite > 0.3 ? "bg-alerta" : "bg-positivo"}`} style={{ width: `${Math.min(usoLimite, 1) * 100}%` }} />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-suave">Compras à vista (média/mês)</span>
            <Valor centavos={c.mediaAVistaCentavos} />
          </div>
          {c.encargos3mCentavos > 0 && (
            <div className="flex justify-between text-negativo">
              <span>⚠ Juros e encargos (3 meses)</span>
              <Valor centavos={c.encargos3mCentavos} />
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <BarrasMensais
            titulo="Próximas faturas (conhecida ou só as parcelas já contratadas)"
            cor={k.escopoPadrao === "PJ" ? "pj" : "pf"}
            dados={c.projecao.map((p) => ({ mes: p.mes, valor: p.valorCentavos }))}
          />
          <p className="mt-1 text-xs text-suave">
            Meses sem fatura conhecida mostram só as parcelas: as compras novas vêm por cima (média à vista acima).
          </p>
        </div>
      </div>

      {c.parcelas.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm underline">Parcelas a vencer ({c.parcelas.length})</summary>
          <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-suave">
              <tr>
                <th className="py-1 font-medium">Fatura</th>
                <th className="py-1 font-medium">Compra</th>
                <th className="py-1 font-medium">Parcela</th>
                <th className="py-1 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {c.parcelas.map((p) => (
                <tr key={`${p.descricao}-${p.numero}-${p.vencimento}`} className="border-t border-borda">
                  <td className="py-1">{formatarData(p.vencimento)}</td>
                  <td className="py-1">{p.descricao}</td>
                  <td className="py-1 text-suave">
                    {p.numero}/{p.total}
                  </td>
                  <td className="py-1 text-right">
                    <Valor centavos={p.valorCentavos} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <details className="mt-3" open={c.vinculados.some((v) => v.compras90d > 0 && v.ativo === false)}>
        <summary className="cursor-pointer text-sm underline">Cartões virtuais e adicionais ({c.vinculados.length})</summary>
        <p className="mt-2 text-xs text-suave">
          Virtuais e adicionais caem na mesma fatura deste cartão. Os finais encontrados nas faturas entram aqui sozinhos; ao cancelar um
          virtual no app do banco, marque como cancelado: o consultor avisa se havia assinatura cobrada nele.
        </p>
        {c.vinculados.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {c.vinculados.map((v) => (
              <li key={v.id} className={`flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-1 ${v.ativo ? "" : "text-suave"}`}>
                <span>
                  {v.apelido} <span className="text-xs text-suave">· {v.tipo} · final {v.final}</span>
                  {!v.ativo && <span className="text-xs"> · cancelado{v.canceladoEm ? ` em ${formatarData(v.canceladoEm)}` : ""}</span>}
                  {v.compras90d > 0 && (
                    <span className="text-xs text-suave">
                      {" "}
                      · {v.compras90d} compra(s) em 90 dias, {formatarMoeda(v.total90dCentavos)}
                    </span>
                  )}
                </span>
                <span className="flex gap-3 text-xs">
                  <Formulario acao={alternarCartaoVinculado} mensagemOk={null} retornoEmLinha>
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="ativo" value={v.ativo ? "0" : "1"} />
                    <BotaoEnviar variante="link" pendente="salvando…">
                      {v.ativo ? "marcar como cancelado" : "reativar"}
                    </BotaoEnviar>
                  </Formulario>
                  <Formulario acao={removerCartaoVinculado} mensagemOk={null} retornoEmLinha>
                    <input type="hidden" name="id" value={v.id} />
                    <BotaoEnviar variante="link" pendente="removendo…" className="text-suave hover:text-negativo">
                      remover
                    </BotaoEnviar>
                  </Formulario>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Formulario acao={novoVinculado} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="contaId" value={k.id} />
          <label className="grid gap-1">
            <span className="text-xs text-suave">Tipo</span>
            <select name="tipo" className={estiloCampo} defaultValue="virtual">
              <option value="virtual">Virtual</option>
              <option value="adicional">Adicional</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-suave">Final (4 dígitos)</span>
            <input name="final" inputMode="numeric" maxLength={4} required className={`${estiloCampo} w-24`} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-suave">Nome (opcional)</span>
            <input name="apelido" placeholder="Ex.: Virtual assinaturas" className={estiloCampo} />
          </label>
          <BotaoEnviar pendente="Adicionando…">Adicionar</BotaoEnviar>
        </Formulario>
      </details>

      {c.faturas.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm underline">Faturas registradas ({c.faturas.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {c.faturas.map((f) => {
              const s = situacao(f);
              return (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-borda pt-1">
                  <span>
                    Vence {formatarData(f.vencimento)} · <Valor centavos={f.valorCentavos} />
                    <span className="text-xs text-suave">
                      {" "}
                      · <span className={s.tom}>{s.texto}</span> · {f.origem === "manual" ? "lançada à mão" : "lida do arquivo"}
                      {f.minimoCentavos ? ` · mínimo ${formatarMoeda(f.minimoCentavos)}` : ""}
                    </span>
                    {f.pagamentos.length > 0 && (
                      <span className="block text-xs text-suave">
                        Pagamentos: {f.pagamentos.map((p) => `${formatarData(p.data)} ${formatarMoeda(p.valorCentavos)}`).join(" + ")} ({FONTE[f.pagamentos[0].fonte]})
                      </span>
                    )}
                  </span>
                  <span className="flex gap-3 text-xs">
                    {f.status !== "paga" || f.manual ? (
                      <Formulario acao={marcarFatura} mensagemOk={null} retornoEmLinha>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="paga" value={f.manual ? "0" : "1"} />
                        <BotaoEnviar variante="link" pendente="salvando…">
                          {f.manual ? "desfazer “paga”" : "marcar como paga"}
                        </BotaoEnviar>
                      </Formulario>
                    ) : null}
                    <Formulario acao={removerFatura} mensagemOk={null} retornoEmLinha>
                      <input type="hidden" name="id" value={f.id} />
                      <BotaoEnviar variante="link" pendente="removendo…" className="text-suave hover:text-negativo">
                        remover
                      </BotaoEnviar>
                    </Formulario>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm underline">Editar cartão</summary>
        <div className="mt-3">
          <FormCartao
            cartao={{
              id: k.id,
              apelido: k.apelido,
              escopoPadrao: k.escopoPadrao,
              finalCartao: k.finalCartao,
              diaFechamento: k.diaFechamento,
              diaVencimento: k.diaVencimento,
              limiteCentavos: k.limiteCentavos,
              contaPagamentoId: k.contaPagamentoId,
            }}
            contas={contas}
            emissores={emissores}
          />
        </div>
      </details>
    </Cartao>
  );
}
