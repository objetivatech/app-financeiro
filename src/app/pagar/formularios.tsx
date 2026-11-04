"use client";

import { seguro } from "@/components/formulario";
import { useActionState, useState } from "react";
import { Botao, estiloCampo } from "@/components/ui";
import { novaContaAvulsa, novaDivida, novaRecorrencia } from "./acoes";

type Conta = { id: number; apelido: string };
type Categoria = { id: string; nome: string; escopo: string | null };

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

function SeletorConta({ contas }: { contas: Conta[] }) {
  return (
    <select name="contaId" className={estiloCampo} defaultValue="">
      <option value="">Qualquer conta</option>
      {contas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.apelido}
        </option>
      ))}
    </select>
  );
}

function SeletorEscopo() {
  return (
    <select name="escopo" className={estiloCampo} defaultValue="PF">
      <option value="PF">Pessoal (PF)</option>
      <option value="PJ">Empresa (PJ)</option>
    </select>
  );
}

export function FormularioDivida({ contas }: { contas: Conta[] }) {
  const [estado, acao, pendente] = useActionState(seguro(novaDivida), null);
  const [modo, setModo] = useState<"fixas" | "diferentes" | "selic">("fixas");
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-2">
      <Campo rotulo="Nome">
        <input name="nome" required placeholder="Ex.: Acordo judicial — parcelas" className={estiloCampo} />
      </Campo>
      <Campo rotulo="Credor">
        <input name="credor" placeholder="Ex.: Porto Seguro" className={estiloCampo} />
      </Campo>
      <Campo rotulo="Tipo">
        <select name="tipo" className={estiloCampo} defaultValue="emprestimo">
          <option value="acordo_judicial">Acordo judicial</option>
          <option value="emprestimo">Empréstimo</option>
          <option value="parcelamento_imposto">Parcelamento de imposto (MEI, DAS…)</option>
          <option value="financiamento">Financiamento</option>
          <option value="compra_parcelada">Compra parcelada / crediário</option>
          <option value="outro">Outro</option>
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="De quem é">
          <SeletorEscopo />
        </Campo>
        <Campo rotulo="Paga pela conta">
          <SeletorConta contas={contas} />
        </Campo>
      </div>

      <div className="md:col-span-2 flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="modo" value="fixas" checked={modo === "fixas"} onChange={() => setModo("fixas")} /> Parcelas iguais
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="modo" value="diferentes" checked={modo === "diferentes"} onChange={() => setModo("diferentes")} /> Valores diferentes
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="modo" value="selic" checked={modo === "selic"} onChange={() => setModo("selic")} /> Parcelamento da Receita (Selic)
        </label>
      </div>
      {modo === "selic" ? (
        <div className="md:col-span-2 grid gap-3">
          <p className="text-xs text-suave">
            Parcelamento de DAS do Simples/MEI na Receita: a 1ª parcela é a básica; as seguintes somam a Selic acumulada + 1% e vencem
            no último dia útil do mês. O app estima os valores; a baixa usa o valor real que aparecer no extrato.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Campo rotulo="Parcela básica">
              <input name="valorParcela" placeholder="97,61" className={estiloCampo} />
            </Campo>
            <Campo rotulo="Nº de parcelas">
              <input name="quantidade" type="number" min={1} placeholder="10" className={estiloCampo} />
            </Campo>
            <Campo rotulo="Vencimento da 1ª">
              <input name="primeiroVencimento" type="date" className={estiloCampo} />
            </Campo>
            <Campo rotulo="Já pagas" dica="Das primeiras">
              <input name="jaPagas" type="number" min={0} defaultValue={0} className={estiloCampo} />
            </Campo>
            <Campo rotulo="Selic ao mês (%)" dica="Estimativa; confira no DAS">
              <input name="selicMensal" defaultValue="1,10" className={estiloCampo} />
            </Campo>
          </div>
        </div>
      ) : modo === "fixas" ? (
        <div className="md:col-span-2 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Campo rotulo="Valor da parcela">
            <input name="valorParcela" placeholder="637,50" className={estiloCampo} />
          </Campo>
          <Campo rotulo="Nº de parcelas">
            <input name="quantidade" type="number" min={1} placeholder="53" className={estiloCampo} />
          </Campo>
          <Campo rotulo="1º vencimento">
            <input name="primeiroVencimento" type="date" className={estiloCampo} />
          </Campo>
          <Campo rotulo="Já pagas" dica="Das primeiras">
            <input name="jaPagas" type="number" min={0} defaultValue={0} className={estiloCampo} />
          </Campo>
          <label className="col-span-2 flex items-center gap-1.5 text-sm md:col-span-4">
            <input type="checkbox" name="ultimoDiaUtil" /> Da 2ª em diante, vence no último dia útil do mês
          </label>
        </div>
      ) : (
        <div className="md:col-span-2 grid gap-3 md:grid-cols-[1fr_auto]">
          <Campo rotulo="Parcelas (uma por linha: data e valor)" dica="Ex.: 20/11/2026 639,88">
            <textarea name="parcelasTexto" rows={5} className={`${estiloCampo} font-mono`} placeholder={"20/11/2026 639,88\n20/12/2026 467,91\n20/01/2027 467,92"} />
          </Campo>
          <Campo rotulo="Já pagas" dica="Das primeiras">
            <input name="jaPagas" type="number" min={0} defaultValue={0} className={estiloCampo} />
          </Campo>
        </div>
      )}

      <Campo rotulo="Valor que você recebeu (opcional)" dica="Para calcular os juros. Ex.: pegou R$ 595 e vai pagar R$ 901.">
        <input name="valorRecebido" placeholder="595,00" className={estiloCampo} />
      </Campo>
      <Campo rotulo="Atraso máximo tolerado, em dias (opcional)" dica="Ex.: 30 no acordo judicial. O app alerta antes.">
        <input name="diasTolerancia" type="number" min={1} className={estiloCampo} />
      </Campo>
      <Campo rotulo="O que acontece se passar desse atraso">
        <input name="consequencia" placeholder="Ex.: o acordo é cancelado e a dívida volta ao valor original + 10%" className={estiloCampo} />
      </Campo>
      <Campo rotulo="Lembrete depois de pagar (opcional)">
        <input name="lembrete" placeholder="Ex.: enviar comprovante para o escritório em até 2 dias úteis" className={estiloCampo} />
      </Campo>
      <div className="md:col-span-2 flex items-center gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Cadastrar dívida"}
        </Botao>
        <Retorno estado={estado} />
      </div>
    </form>
  );
}

export function FormularioRecorrencia({ contas, categorias }: { contas: Conta[]; categorias: Categoria[] }) {
  const [estado, acao, pendente] = useActionState(seguro(novaRecorrencia), null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-3">
      <Campo rotulo="Descrição">
        <input name="descricao" required placeholder="Ex.: Contabilidade" className={estiloCampo} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor (aprox.)">
          <input name="valor" placeholder="450,00" className={estiloCampo} />
        </Campo>
        <Campo rotulo="Dia do mês">
          <input name="dia" type="number" min={1} max={31} placeholder="10" className={estiloCampo} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Tipo">
          <select name="tipo" className={estiloCampo} defaultValue="pagar">
            <option value="pagar">A pagar</option>
            <option value="receber">A receber</option>
          </select>
        </Campo>
        <Campo rotulo="De quem é">
          <SeletorEscopo />
        </Campo>
      </div>
      <Campo rotulo="Categoria">
        <select name="categoriaId" className={estiloCampo} defaultValue="">
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.escopo ? `${c.escopo} · ` : ""}
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Conta">
        <SeletorConta contas={contas} />
      </Campo>
      <Campo rotulo="Texto no extrato (opcional)" dica="Ajuda a reconhecer o pagamento. Ex.: CONTABIL">
        <input name="padrao" className={estiloCampo} />
      </Campo>
      <Campo rotulo="Começa em">
        <input name="inicio" type="date" className={estiloCampo} />
      </Campo>
      <Campo rotulo="Termina em (opcional)">
        <input name="fim" type="date" className={estiloCampo} />
      </Campo>
      <div className="flex items-end gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Cadastrar conta fixa"}
        </Botao>
      </div>
      <div className="md:col-span-3">
        <Retorno estado={estado} />
      </div>
    </form>
  );
}

export function FormularioAvulsa({ contas }: { contas: Conta[] }) {
  const [estado, acao, pendente] = useActionState(seguro(novaContaAvulsa), null);
  return (
    <form action={acao} className="grid gap-3 md:grid-cols-3">
      <Campo rotulo="Descrição">
        <input name="descricao" required placeholder="Ex.: IPVA" className={estiloCampo} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor">
          <input name="valor" placeholder="1.200,00" className={estiloCampo} />
        </Campo>
        <Campo rotulo="Vencimento">
          <input name="vencimento" type="date" className={estiloCampo} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Tipo">
          <select name="tipo" className={estiloCampo} defaultValue="pagar">
            <option value="pagar">A pagar</option>
            <option value="receber">A receber</option>
          </select>
        </Campo>
        <Campo rotulo="De quem é">
          <SeletorEscopo />
        </Campo>
      </div>
      <Campo rotulo="Conta">
        <SeletorConta contas={contas} />
      </Campo>
      <div className="flex items-end gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Lançar"}
        </Botao>
        <Retorno estado={estado} />
      </div>
    </form>
  );
}
