"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Botao, Cartao, estiloCampo } from "@/components/ui";
import type { SituacaoTrabalho } from "@/lib/importacao/fila";

interface Item {
  chave: string;
  nome: string;
  /** Arquivo ainda não enviado (some depois do upload). */
  arquivo?: File;
  /** Id do trabalho na fila do servidor. */
  id?: number;
  envio: "pendente" | "enviando" | "enviado" | "falhou";
  erroEnvio?: string;
  situacao?: SituacaoTrabalho;
}

const INTERVALO_MS = 3000;

function terminado(item: Item): boolean {
  return item.envio === "falhou" || item.situacao?.status === "concluido" || item.situacao?.status === "erro";
}

function resumoConcluido(s: SituacaoTrabalho): string {
  const r = s.resultado;
  if (!r) return "importado";
  return [
    `${r.novas} novas em ${r.contaApelido}${r.contaNova ? " (conta nova)" : ""}`,
    r.duplicadas ? `${r.duplicadas} já existiam` : "",
    r.extraidoPor === "ia" ? "lido pela IA" : "",
    r.instituicaoReconhecida ? "" : "banco não reconhecido: ajuste em Contas",
    s.segundos !== null ? `${s.segundos}s` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function Importador({
  contas,
  idsIniciais,
}: {
  contas: { id: number; apelido: string }[];
  /** Trabalhos que já estavam na fila quando a página abriu. */
  idsIniciais: number[];
}) {
  const [itens, setItens] = useState<Item[]>(() =>
    idsIniciais.map((id) => ({ chave: `srv-${id}`, nome: `#${id}`, id, envio: "enviado" })),
  );
  const [contaId, setContaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  // O servidor ainda está trabalhando (lendo arquivos ou classificando o lote)?
  const [ocupada, setOcupada] = useState(idsIniciais.length > 0);
  // Cópia sempre atual da lista, para o envio e a consulta (que rodam fora da renderização).
  const itensRef = useRef(itens);
  useEffect(() => {
    itensRef.current = itens;
  }, [itens]);

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novos = Array.from(lista).map((arquivo, i) => ({
      chave: `${Date.now()}-${i}-${arquivo.name}`,
      nome: arquivo.name,
      arquivo,
      envio: "pendente" as const,
    }));
    setItens((atuais) => [...atuais, ...novos]);
  }

  function atualizar(chave: string, parcial: Partial<Item>) {
    setItens((atuais) => atuais.map((item) => (item.chave === chave ? { ...item, ...parcial } : item)));
  }

  // Envio: rápido, só coloca na fila do servidor. A leitura acontece lá, em segundo plano.
  async function enviarTudo() {
    setEnviando(true);
    for (const item of itensRef.current.filter((i) => i.envio === "pendente" && i.arquivo)) {
      // Saiu da lista (fila cancelada durante o envio)? Não envia.
      if (!itensRef.current.some((i) => i.chave === item.chave && i.envio === "pendente")) continue;
      atualizar(item.chave, { envio: "enviando" });
      const form = new FormData();
      form.append("arquivo", item.arquivo!);
      if (contaId) form.append("contaId", contaId);
      try {
        const resposta = await fetch("/api/importar", { method: "POST", body: form });
        const corpo = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !corpo.id) {
          atualizar(item.chave, { envio: "falhou", erroEnvio: corpo.erro ?? `Falha no envio (HTTP ${resposta.status}).` });
        } else {
          atualizar(item.chave, { envio: "enviado", id: corpo.id, arquivo: undefined });
          setOcupada(true);
        }
      } catch {
        atualizar(item.chave, { envio: "falhou", erroEnvio: "Sem resposta do servidor." });
      }
    }
    setEnviando(false);
  }

  const consultar = useCallback(async () => {
    const abertos = itensRef.current.filter((i) => i.id && !terminado(i));
    try {
      const resposta = await fetch(`/api/importar?ids=${abertos.map((i) => i.id).join(",")}`);
      if (!resposta.ok) return;
      const corpo: { trabalhos: SituacaoTrabalho[]; ocupada: boolean } = await resposta.json();
      const porId = new Map(corpo.trabalhos.map((t) => [t.id, t]));
      setItens((atuais) =>
        atuais.map((item) => {
          const s = item.id ? porId.get(item.id) : undefined;
          return s ? { ...item, situacao: s, nome: s.nomeArquivo } : item;
        }),
      );
      setOcupada(corpo.ocupada);
    } catch {
      // Rede instável: tenta de novo no próximo ciclo.
    }
  }, []);

  const [cancelando, setCancelando] = useState(false);
  async function cancelar() {
    if (!window.confirm("Cancelar a importação? O que ainda não foi lido será descartado; o que já foi importado continua.")) return;
    setCancelando(true);
    // Arquivos que nem chegaram a ser enviados também saem da lista.
    setItens((atuais) => atuais.filter((i) => i.envio !== "pendente"));
    await fetch("/api/importar", { method: "DELETE" }).catch(() => null);
    await consultar();
    setCancelando(false);
  }

  const precisaConsultar = ocupada || itens.some((i) => i.id && !terminado(i));
  useEffect(() => {
    if (!precisaConsultar) return;
    void consultar();
    const timer = setInterval(() => void consultar(), INTERVALO_MS);
    return () => clearInterval(timer);
  }, [precisaConsultar, consultar]);

  const pendentes = itens.filter((i) => i.envio === "pendente").length;
  const algumConcluido = itens.some((i) => i.situacao?.status === "concluido");
  const emAndamento = itens.some((i) => i.id && !terminado(i));

  return (
    <Cartao>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionar(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-10 text-center text-sm ${
          arrastando ? "border-pj bg-pj/5" : "border-borda"
        }`}
      >
        <span className="font-medium">Solte os arquivos aqui ou clique para escolher</span>
        <span className="mt-1 text-suave">.ofx · .csv · .pdf · .png · .jpg — até 25 MB cada</span>
        <input
          type="file"
          multiple
          accept=".ofx,.qfx,.csv,.txt,.pdf,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            adicionar(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {itens.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {itens.map((item) => (
            <LinhaItem key={item.chave} item={item} />
          ))}
        </ul>
      )}

      {(emAndamento || ocupada) && (
        <p className="mt-4 rounded-md bg-foreground/[0.04] p-3 text-xs text-suave">
          {!emAndamento
            ? "Classificando as transações importadas…"
            : "Processando no servidor. PDFs e fotos são lidos pela IA e podem levar alguns minutos cada. Pode fechar esta página: a importação continua e o resultado aparece aqui quando você voltar."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={estiloCampo} disabled={enviando}>
          <option value="">Detectar a conta automaticamente</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              Forçar conta: {c.apelido}
            </option>
          ))}
        </select>
        <Botao onClick={enviarTudo} disabled={enviando || pendentes === 0}>
          {enviando ? "Enviando…" : `Importar ${pendentes || ""} arquivo(s)`}
        </Botao>
        {(emAndamento || ocupada) && (
          <button onClick={cancelar} disabled={cancelando} className="text-sm text-negativo underline disabled:opacity-50">
            {cancelando ? "Cancelando…" : "Cancelar fila"}
          </button>
        )}
        {algumConcluido && !emAndamento && !ocupada && (
          <Link href="/transacoes?revisar=1" className="text-sm underline">
            Revisar transações
          </Link>
        )}
      </div>
    </Cartao>
  );
}

function LinhaItem({ item }: { item: Item }) {
  const s = item.situacao;
  let rotulo = "";
  let cor = "text-suave";
  let detalhe: string | null = null;

  if (item.envio === "pendente") rotulo = "aguardando envio";
  else if (item.envio === "enviando") rotulo = "enviando…";
  else if (item.envio === "falhou") {
    rotulo = "erro";
    cor = "text-negativo";
    detalhe = item.erroEnvio ?? null;
  } else if (!s || s.status === "fila") rotulo = "na fila";
  else if (s.status === "processando") rotulo = `lendo…${s.segundos ? ` ${s.segundos}s` : ""}`;
  else if (s.status === "concluido") {
    rotulo = "importado";
    cor = "text-positivo";
    detalhe = resumoConcluido(s);
  } else if (s.mensagem === "Cancelado por você.") {
    rotulo = "cancelado";
  } else {
    rotulo = "erro";
    cor = "text-negativo";
    detalhe = s.mensagem;
  }

  const avisos = s?.status === "concluido" ? (s.resultado?.avisos ?? []) : [];
  return (
    <li className="flex flex-col gap-0.5 border-t border-borda pt-2 first:border-0 first:pt-0">
      <div className="flex justify-between gap-3">
        <span className="truncate">{item.nome}</span>
        <span className={`whitespace-nowrap ${cor}`}>{rotulo}</span>
      </div>
      {detalhe && <span className="text-suave">{detalhe}</span>}
      {avisos.length > 0 && (
        <details className="text-xs text-suave">
          <summary>{avisos.length} aviso(s)</summary>
          <ul className="ml-4 list-disc">
            {avisos.map((a, j) => (
              <li key={j}>{a}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
