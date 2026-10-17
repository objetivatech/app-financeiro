"use client";

import { useState, type ReactNode } from "react";
import { Botao, estiloCampo } from "@/components/ui";
import { CATEGORIAS_PADRAO } from "@/lib/classificacao/categorias";
import type { TransacaoListada } from "@/lib/consultas";
import { NATUREZAS } from "@/lib/naturezas";
import { ROTULOS_NATUREZA } from "@/lib/formato";
import { marcarRevisada, salvarClassificacao } from "./acoes";

/** Sugere o trecho da descrição para uma regra: tira números, datas e códigos. */
function sugerirPadrao(descricaoNormalizada: string): string {
  return descricaoNormalizada
    .replace(/^COMPRA (NO |COM )?(DEBITO|CREDITO|CARTAO)( - )?/, "")
    .replace(/[0-9]+([/.:-][0-9]+)*/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function LinhaTransacao(props: {
  t: TransacaoListada;
  data: string;
  valor: ReactNode;
  selo: ReactNode;
  categoriaNome: string;
  naturezaNome: string | null;
}) {
  const { t } = props;
  const [editando, setEditando] = useState(false);

  return (
    <>
      <tr className={`border-t border-borda align-top ${t.revisar ? "bg-alerta/5" : ""}`}>
        <td className="numero whitespace-nowrap px-3 py-2 text-suave">{props.data}</td>
        <td className="px-3 py-2">
          <div>{t.descricao}</div>
          <div className="text-xs text-suave">
            {t.contaApelido}
            {t.parcelaAtual && t.parcelaTotal ? ` · parcela ${t.parcelaAtual}/${t.parcelaTotal}` : ""}
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {props.selo}
            <span>{props.categoriaNome}</span>
          </div>
          {props.naturezaNome && <div className="text-xs text-alerta">{props.naturezaNome}</div>}
          {t.motivo && (
            <div className="text-xs text-suave" title={t.classificadoPor ?? undefined}>
              {t.motivo}
              {t.classificadoPor === "ia" && t.confianca !== null ? ` (${Math.round(t.confianca * 100)}%)` : ""}
            </div>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">{props.valor}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {t.revisar && !editando && (
            <form action={marcarRevisada} className="inline">
              <input type="hidden" name="id" value={t.id} />
              <button className="mr-2 text-xs underline">está certo</button>
            </form>
          )}
          <button onClick={() => setEditando((v) => !v)} className="text-xs underline">
            {editando ? "fechar" : "corrigir"}
          </button>
        </td>
      </tr>
      {editando && (
        <tr className="bg-foreground/[0.03]">
          <td colSpan={5} className="px-3 py-3">
            <form
              action={async (fd) => {
                await salvarClassificacao(fd);
                setEditando(false);
              }}
              className="flex flex-wrap items-end gap-2 text-sm"
            >
              <input type="hidden" name="id" value={t.id} />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-suave">De quem é</span>
                <select name="escopo" defaultValue={t.escopo ?? ""} className={estiloCampo}>
                  <option value="">Não sei</option>
                  <option value="PF">Pessoal (PF)</option>
                  <option value="PJ">Empresa (PJ)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-suave">Categoria</span>
                <select name="categoriaId" defaultValue={t.categoriaId ?? ""} className={estiloCampo}>
                  <option value="">Sem categoria</option>
                  {CATEGORIAS_PADRAO.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.escopo ? `${c.escopo} · ` : ""}
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-suave">Natureza</span>
                <select name="natureza" defaultValue={t.natureza} className={estiloCampo}>
                  {NATUREZAS.map((n) => (
                    <option key={n} value={n}>
                      {ROTULOS_NATUREZA[n]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="criarRegra" /> Aplicar a todas que contêm:
                </label>
                <input name="padrao" defaultValue={sugerirPadrao(t.descricaoNormalizada)} className={`${estiloCampo} w-64`} />
                <label className="flex items-center gap-1.5 text-xs text-suave">
                  <input type="checkbox" name="regraSoNestaConta" /> só nesta conta
                </label>
              </div>
              <Botao type="submit">Salvar</Botao>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
