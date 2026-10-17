import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Botao, Cartao, Carregando, estiloCampo, SeloEscopo, Valor } from "@/components/ui";
import { listarContas } from "@/lib/consultas";
import { obterDb } from "@/lib/db";
import { formatarData, ROTULOS_TIPO_CONTA } from "@/lib/formato";
import { excluirConta, salvarConta } from "./acoes";

export default function PaginaContas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Contas e cartões</h1>
        <p className="mt-1 text-sm text-suave">
          As contas aparecem aqui conforme você importa extratos. Diga de quem é cada uma (PF, PJ ou mista): isso guia a
          classificação e a detecção de mistura.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Lista />
      </Suspense>
      <Inventario />
    </div>
  );
}

async function Lista() {
  await connection();
  const contas = await listarContas(obterDb());
  if (contas.length === 0) {
    return (
      <Cartao>
        <p className="text-sm text-suave">
          Nenhuma conta ainda. <Link href="/importar" className="underline">Importe o primeiro extrato</Link>.
        </p>
      </Cartao>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {contas.map((c) => (
        <Cartao key={c.id} className={c.ativa ? "" : "opacity-60"}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {c.apelido} <SeloEscopo escopo={c.escopoPadrao} />
                {c.candidataEncerrar && <span className="text-xs text-alerta">encerrar</span>}
              </div>
              <div className="text-xs text-suave">
                {c.instituicaoNome} · {ROTULOS_TIPO_CONTA[c.tipo]}
                {c.agencia ? ` · ag ${c.agencia}` : ""}
                {c.numero ? ` · conta ${c.numero}` : ""}
                {c.finalCartao ? ` · final ${c.finalCartao}` : ""}
              </div>
            </div>
            <div className="text-right text-xs text-suave">
              <div>{c.quantidade} transações</div>
              {c.primeira && c.ultima && (
                <div>
                  {formatarData(c.primeira)} – {formatarData(c.ultima)}
                </div>
              )}
              <div>
                movimentou <Valor centavos={Number(c.movimentado)} />
              </div>
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm underline">editar</summary>
            <form action={salvarConta} className="mt-3 grid gap-2 text-sm">
              <input type="hidden" name="id" value={c.id} />
              <label className="grid gap-1">
                <span className="text-xs text-suave">Apelido</span>
                <input name="apelido" defaultValue={c.apelido} className={estiloCampo} />
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="grid gap-1">
                  <span className="text-xs text-suave">De quem é</span>
                  <select name="escopoPadrao" defaultValue={c.escopoPadrao} className={estiloCampo}>
                    <option value="PF">Pessoal (PF)</option>
                    <option value="PJ">Empresa (PJ)</option>
                    <option value="misto">Mista (uso as duas coisas)</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-suave">Tipo</span>
                  <select name="tipo" defaultValue={c.tipo} className={estiloCampo}>
                    {Object.entries(ROTULOS_TIPO_CONTA).map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1">
                <span className="text-xs text-suave">Observação</span>
                <input name="observacao" defaultValue={c.observacao ?? ""} className={estiloCampo} />
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="ativa" defaultChecked={c.ativa} /> Ativa
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="candidataEncerrar" defaultChecked={c.candidataEncerrar} /> Quero encerrar
                </label>
              </div>
              <div>
                <Botao type="submit">Salvar</Botao>
              </div>
            </form>
            <form action={excluirConta} className="mt-4 flex items-center gap-2 border-t border-borda pt-3 text-xs">
              <input type="hidden" name="id" value={c.id} />
              <label className="flex items-center gap-1.5 text-suave">
                <input type="checkbox" name="confirmar" /> Excluir esta conta e todas as transações dela
              </label>
              <button className="text-negativo underline">excluir</button>
            </form>
          </details>
        </Cartao>
      ))}
    </div>
  );
}

function Inventario() {
  return (
    <Cartao titulo="Descobrir todas as contas no seu nome">
      <div className="space-y-2 text-sm">
        <p>
          O <strong>Registrato</strong>, do Banco Central, é gratuito e lista onde você tem relacionamento — tanto no seu
          CPF quanto no CNPJ da empresa:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Contas e Relacionamentos (CCS):</strong> todas as instituições onde há conta aberta, inclusive as
            esquecidas.
          </li>
          <li>
            <strong>Empréstimos e Financiamentos (SCR):</strong> dívidas e limites, incluindo cartões de crédito.
          </li>
          <li>
            <strong>Chaves Pix:</strong> onde cada chave Pix está registrada.
          </li>
        </ul>
        <p className="text-suave">
          Acesse em <span className="font-mono">registrato.bcb.gov.br</span> com a conta gov.br (nível prata ou ouro). Para
          o CNPJ, entre como representante da empresa. Compare a lista com as contas acima e marque como “quero
          encerrar” as que não fazem mais sentido. Instituições de fora do Brasil (como a parte internacional da Wise e
          do PayPal) podem não aparecer.
        </p>
      </div>
    </Cartao>
  );
}
