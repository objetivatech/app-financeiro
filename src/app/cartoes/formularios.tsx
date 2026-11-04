"use client";

import { seguro } from "@/components/formulario";
import { useActionState } from "react";
import { Botao, estiloCampo } from "@/components/ui";
import { lancarFatura, salvarCartao } from "./acoes";

type Conta = { id: number; apelido: string };

export interface DadosCartao {
  id: number;
  apelido: string;
  escopoPadrao: "PF" | "PJ" | "misto";
  finalCartao: string | null;
  diaFechamento: number | null;
  diaVencimento: number | null;
  limiteCentavos: number | null;
  contaPagamentoId: number | null;
}

function Retorno({ estado }: { estado: { erro?: string; ok?: string } | null }) {
  if (!estado) return null;
  return <p className={`text-sm ${estado.erro ? "text-negativo" : "text-positivo"}`}>{estado.erro ?? estado.ok}</p>;
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-suave">{rotulo}</span>
      {children}
      {dica && <span className="text-xs text-suave">{dica}</span>}
    </label>
  );
}

const reais = (centavos: number | null) => (centavos === null ? "" : (centavos / 100).toFixed(2).replace(".", ","));

/** Cadastro (sem `cartao`) ou edição de um cartão. */
export function FormCartao({ cartao, contas, emissores }: { cartao?: DadosCartao; contas: Conta[]; emissores: { id: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(seguro(salvarCartao), null);
  return (
    <form action={acao} className="grid gap-3">
      {cartao && <input type="hidden" name="id" value={cartao.id} />}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome do cartão">
          <input name="apelido" required defaultValue={cartao?.apelido} placeholder="Ex.: Nubank PF" className={estiloCampo} />
        </Campo>
        {!cartao && (
          <Campo rotulo="Emissor">
            <select name="instituicaoId" className={estiloCampo} defaultValue="">
              <option value="">Outro (use o nome)</option>
              {emissores.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="De quem é">
          <select name="escopo" defaultValue={cartao?.escopoPadrao ?? "PF"} className={estiloCampo}>
            <option value="PF">Pessoal (PF)</option>
            <option value="PJ">Empresa (PJ)</option>
            <option value="misto">Misto (uso para as duas coisas)</option>
          </select>
        </Campo>
        <Campo rotulo="Final do cartão" dica="4 últimos dígitos (ajuda a reconhecer a fatura)">
          <input name="finalCartao" inputMode="numeric" maxLength={4} defaultValue={cartao?.finalCartao ?? ""} className={estiloCampo} />
        </Campo>
        <Campo rotulo="Dia do fechamento" dica="compras a partir deste dia vão para a fatura seguinte">
          <input name="diaFechamento" type="number" min={1} max={31} defaultValue={cartao?.diaFechamento ?? ""} className={estiloCampo} />
        </Campo>
        <Campo rotulo="Dia do vencimento">
          <input name="diaVencimento" type="number" min={1} max={31} defaultValue={cartao?.diaVencimento ?? ""} className={estiloCampo} />
        </Campo>
        <Campo rotulo="Limite (R$)">
          <input name="limite" inputMode="decimal" placeholder="5.000,00" defaultValue={reais(cartao?.limiteCentavos ?? null)} className={estiloCampo} />
        </Campo>
        <Campo rotulo="Conta que paga a fatura" dica="para baixar a fatura quando o pagamento aparecer no extrato">
          <select name="contaPagamentoId" defaultValue={cartao?.contaPagamentoId ?? ""} className={estiloCampo}>
            <option value="">Não sei / varia</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : cartao ? "Salvar" : "Cadastrar cartão"}
        </Botao>
        <Retorno estado={estado} />
      </div>
    </form>
  );
}

/** Lançamento manual da fatura (quando não há PDF, ou para corrigir o total). */
export function FormFatura({ cartoes, cartaoInicial }: { cartoes: Conta[]; cartaoInicial?: number }) {
  const [estado, acao, pendente] = useActionState(seguro(lancarFatura), null);
  return (
    <form action={acao} className="grid gap-3">
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Campo rotulo="Cartão">
          <select name="contaId" required defaultValue={cartaoInicial ?? ""} className={estiloCampo}>
            <option value="" disabled>
              Escolha
            </option>
            {cartoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Vencimento">
          <input name="vencimento" type="date" required className={estiloCampo} />
        </Campo>
        <Campo rotulo="Total a pagar (R$)">
          <input name="valor" inputMode="decimal" required placeholder="1.234,56" className={estiloCampo} />
        </Campo>
        <Campo rotulo="Fechamento (opcional)">
          <input name="fechamento" type="date" className={estiloCampo} />
        </Campo>
        <Campo rotulo="Mínimo (opcional)">
          <input name="minimo" inputMode="decimal" className={estiloCampo} />
        </Campo>
      </div>
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Lançando…" : "Lançar fatura"}
        </Botao>
        <Retorno estado={estado} />
      </div>
    </form>
  );
}
