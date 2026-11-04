import { connection } from "next/server";
import { Suspense } from "react";
import { Botao, Cartao, Carregando, estiloCampo, SeloEscopo } from "@/components/ui";
import { CATEGORIAS_PADRAO } from "@/lib/classificacao/categorias";
import { obterPerfil } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { formatarMoeda, ROTULOS_NATUREZA } from "@/lib/formato";
import { iaDisponivel, modeloDa } from "@/lib/ia/cliente";
import { custosDoMes } from "@/lib/ia/custos";
import { LinkAjuda } from "@/components/link-ajuda";
import { meiAte, obterPerfilFiscal } from "@/lib/fiscal/perfil";
import { BotaoRetiradas } from "./botao-retiradas";
import { excluirRegra, salvarDadosFiscais, salvarPerfil } from "./acoes";

const EXEMPLO_PERFIL = `Ex.: Sou sócio único de uma agência de marketing digital (Simples Nacional, Anexo III).
Faturamento médio de R$ 40 mil/mês. Tiro pró-labore de R$ 3.000 todo dia 5 e distribuo lucros quando sobra.
Pago Google Ads, Meta Ads e ferramentas (Canva, Notion) no cartão da empresa.
Moro com minha esposa; mercado e escola dos filhos são gastos pessoais.`;

export default function PaginaConfiguracoes() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection();
  const db = obterDb();
  const [perfil, listaRegras, fiscal] = await Promise.all([
    obterPerfil(db),
    db.query.regras.findMany({ orderBy: (r, { desc }) => [desc(r.id)] }),
    obterPerfilFiscal(db),
  ]);
  const custos = await custosDoMes(db);
  const custoTotal = custos.reduce((t, c) => t + c.custoUsd, 0);
  const nomeCategoria = new Map(CATEGORIAS_PADRAO.map((c) => [c.id, c.nome]));

  return (
    <>
      <Cartao titulo={<>Dados financeiros e fiscais <LinkAjuda secao="configuracoes" /></>}>
        <form action={salvarDadosFiscais} className="grid gap-3 text-sm md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-suave">Pró-labore mensal</span>
            <input name="proLabore" defaultValue={fiscal.proLaboreMensalCentavos ? formatarMoeda(fiscal.proLaboreMensalCentavos) : ""} placeholder="R$ 4.500,00" className={estiloCampo} />
            <span className="text-xs text-suave">Base do INSS (11%) e da folha usada no Fator R.</span>
          </label>
          <label className="grid gap-1">
            <span className="text-suave">Custo fixo mensal da empresa (com o pró-labore)</span>
            <input name="custoFixo" defaultValue={fiscal.custoFixoPjCentavos ? formatarMoeda(fiscal.custoFixoPjCentavos) : ""} placeholder="R$ 7.000,00" className={estiloCampo} />
            <span className="text-xs text-suave">Base da meta de reserva de caixa da empresa.</span>
          </label>
          <label className="grid gap-1">
            <span className="text-suave">E-mail para os resumos</span>
            <input name="emailResumo" type="email" defaultValue={fiscal.emailResumo} placeholder="voce@empresa.com.br" className={estiloCampo} />
          </label>
          <label className="flex items-center gap-2 self-center">
            <input type="checkbox" name="sujeitoFatorR" defaultChecked={fiscal.sujeitoFatorR} />
            Minha atividade principal está sujeita ao Fator R (Anexo III ou V)
          </label>

          <h3 id="enquadramento" className="mt-2 font-medium md:col-span-2">Enquadramento da empresa</h3>
          <label className="grid gap-1">
            <span className="text-suave">Foi MEI até (mês)</span>
            <input type="month" name="meiAte" defaultValue={meiAte(fiscal) ?? ""} className={estiloCampo} />
            <span className="text-xs text-suave">Deixe vazio se a empresa sempre foi ME/EPP no Simples. O mês seguinte vira o início como ME.</span>
          </label>
          <label className="grid gap-1">
            <span className="text-suave">Pró-labore desde (mês)</span>
            <input type="month" name="proLaboreDesde" defaultValue={fiscal.proLaboreDesde} className={estiloCampo} />
            <span className="text-xs text-suave">A folha do Fator R conta o pró-labore só a partir deste mês (MEI não tem pró-labore).</span>
          </label>

          <h3 id="identificacao" className="mt-2 font-medium md:col-span-2">Como você e a empresa aparecem nos Pix</h3>
          <label className="grid gap-1">
            <span className="text-suave">Seu nome</span>
            <input name="nomeSocio" defaultValue={fiscal.nomeSocio} placeholder="Nome e sobrenome" className={estiloCampo} />
          </label>
          <label className="grid gap-1">
            <span className="text-suave">Seu CPF (opcional)</span>
            <input name="cpfSocio" inputMode="numeric" defaultValue={fiscal.cpfSocio} className={estiloCampo} />
            <span className="text-xs text-suave">Fica só no banco do app; nunca vai para a IA.</span>
          </label>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-suave">Nomes da empresa (separe com ;)</span>
            <input name="nomesEmpresa" defaultValue={fiscal.nomesEmpresa.join("; ")} placeholder="Razão social; nome fantasia" className={estiloCampo} />
            <span className="text-xs text-suave">
              Com isso o app reconhece retiradas (empresa → você) e aportes (você → empresa) mesmo quando só um dos extratos foi importado.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Botao type="submit">Salvar</Botao>
            <BotaoRetiradas />
          </div>
        </form>
      </Cartao>

      <Cartao titulo="Sobre você e sua empresa">
        <form action={salvarPerfil} className="space-y-3">
          <p className="text-sm text-suave">
            A IA usa este texto para classificar melhor e dar dicas que fazem sentido para o seu caso. Conte o que a
            empresa faz, o regime, como você se remunera e quais gastos costumam se misturar.
          </p>
          <textarea name="perfil" defaultValue={perfil} rows={6} placeholder={EXEMPLO_PERFIL} className={`${estiloCampo} w-full`} />
          <Botao type="submit">Salvar</Botao>
        </form>
      </Cartao>

      <Cartao titulo={<>Inteligência artificial <LinkAjuda secao="custos-ia" /></>}>
        {iaDisponivel() ? (
          <div className="space-y-3 text-sm">
            <table className="w-full max-w-md">
              <tbody>
                {(
                  [
                    ["Ler PDFs e fotos", "extracao"],
                    ["Classificar transações", "classificacao"],
                    ["Diagnóstico mensal", "analise"],
                    ["Consultor (chat)", "consultor"],
                    ["Carta semanal", "carta"],
                  ] as const
                ).map(([rotulo, tarefa]) => (
                  <tr key={tarefa} className="border-t border-borda first:border-0">
                    <td className="py-1 pr-3 text-suave">{rotulo}</td>
                    <td className="py-1 font-mono text-xs">{modeloDa(tarefa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <div className="font-medium">
                Gasto estimado este mês: US$ {custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
              {custos.length > 0 ? (
                <ul className="mt-1 text-xs text-suave">
                  {custos.map((c) => (
                    <li key={c.tarefa + c.modelo}>
                      {c.tarefa} · {c.modelo}: {c.chamadas} chamada(s), {c.tokens.toLocaleString("pt-BR")} tokens, US${" "}
                      {c.custoUsd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-suave">Nenhum uso registrado neste mês.</p>
              )}
              <p className="mt-1 text-xs text-suave">
                Estimativa pela tabela de preços da Anthropic; o valor oficial está no console da Anthropic.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm">
            Desativada: defina <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code> do servidor.
          </p>
        )}
        <p className="mt-3 text-xs text-suave">
          O que é enviado: texto de PDFs (ou o arquivo, quando é escaneado) e fotos de extrato (para leitura),
          descrição/data/valor das transações (para classificar) e totais agregados (para as dicas). CPF/CNPJ não são
          enviados na classificação nem nas dicas.
        </p>
      </Cartao>

      <Cartao titulo={`Regras aprendidas (${listaRegras.length})`}>
        {listaRegras.length === 0 ? (
          <p className="text-sm text-suave">
            Nenhuma ainda. Ao corrigir uma transação, marque “Aplicar a todas que contêm…” para criar uma regra.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {listaRegras.map((r) => (
                <tr key={r.id} className="border-t border-borda first:border-0">
                  <td className="py-1.5 pr-2 font-mono text-xs">{r.padrao}</td>
                  <td className="pr-2">
                    <SeloEscopo escopo={r.escopo} />
                  </td>
                  <td className="pr-2">{r.categoriaId ? nomeCategoria.get(r.categoriaId) : ""}</td>
                  <td className="pr-2 text-suave">{r.natureza ? ROTULOS_NATUREZA[r.natureza] : ""}</td>
                  <td className="pr-2 text-xs text-suave">{r.contaId ? "só numa conta" : "todas as contas"}</td>
                  <td className="text-right">
                    <form action={excluirRegra}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-negativo underline">excluir</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
    </>
  );
}
