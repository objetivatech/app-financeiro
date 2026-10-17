"use client";

import Link from "next/link";
import { useState } from "react";
import { Botao, Cartao, estiloCampo } from "@/components/ui";

type Status =
  | { estado: "fila" }
  | { estado: "enviando" }
  | { estado: "ok"; texto: string; avisos: string[] }
  | { estado: "erro"; texto: string };

interface Item {
  arquivo: File;
  status: Status;
}

export function Importador({ contas }: { contas: { id: number; apelido: string }[] }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [contaId, setContaId] = useState("");
  const [rodando, setRodando] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    setItens((atuais) => [...atuais, ...Array.from(lista).map((arquivo) => ({ arquivo, status: { estado: "fila" } as Status }))]);
  }

  function atualizar(indice: number, status: Status) {
    setItens((atuais) => atuais.map((item, i) => (i === indice ? { ...item, status } : item)));
  }

  async function importarTudo() {
    setRodando(true);
    // Um por vez: cada arquivo pode passar pela IA e a classificação usa o resultado dos anteriores.
    for (let i = 0; i < itens.length; i++) {
      if (itens[i].status.estado !== "fila") continue;
      atualizar(i, { estado: "enviando" });
      const form = new FormData();
      form.append("arquivo", itens[i].arquivo);
      if (contaId) form.append("contaId", contaId);
      try {
        const resposta = await fetch("/api/importar", { method: "POST", body: form });
        const corpo = await resposta.json();
        if (!resposta.ok) {
          atualizar(i, { estado: "erro", texto: corpo.erro ?? "Falha ao importar." });
          continue;
        }
        const partes = [
          `${corpo.novas} novas em ${corpo.contaApelido}${corpo.contaNova ? " (conta nova)" : ""}`,
          corpo.duplicadas ? `${corpo.duplicadas} já existiam` : "",
          corpo.extraidoPor === "ia" ? "lido pela IA" : "",
          corpo.instituicaoReconhecida ? "" : "banco não reconhecido: ajuste em Contas",
          corpo.classificacao?.erroIa ? `classificação por IA falhou: ${corpo.classificacao.erroIa}` : "",
        ].filter(Boolean);
        atualizar(i, { estado: "ok", texto: partes.join(" · "), avisos: corpo.avisos ?? [] });
      } catch {
        atualizar(i, { estado: "erro", texto: "Sem resposta do servidor." });
      }
    }
    setRodando(false);
  }

  const pendentes = itens.filter((i) => i.status.estado === "fila").length;
  const concluidos = itens.some((i) => i.status.estado === "ok");

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
          {itens.map((item, i) => (
            <li key={`${item.arquivo.name}-${i}`} className="flex flex-col gap-0.5 border-t border-borda pt-2 first:border-0 first:pt-0">
              <div className="flex justify-between gap-3">
                <span className="truncate">{item.arquivo.name}</span>
                <span
                  className={
                    item.status.estado === "erro"
                      ? "text-negativo"
                      : item.status.estado === "ok"
                        ? "text-positivo"
                        : "text-suave"
                  }
                >
                  {item.status.estado === "fila" && "na fila"}
                  {item.status.estado === "enviando" && "processando…"}
                  {item.status.estado === "ok" && "importado"}
                  {item.status.estado === "erro" && "erro"}
                </span>
              </div>
              {(item.status.estado === "ok" || item.status.estado === "erro") && (
                <span className="text-suave">{item.status.texto}</span>
              )}
              {item.status.estado === "ok" && item.status.avisos.length > 0 && (
                <details className="text-xs text-suave">
                  <summary>{item.status.avisos.length} aviso(s)</summary>
                  <ul className="ml-4 list-disc">
                    {item.status.avisos.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={estiloCampo} disabled={rodando}>
          <option value="">Detectar a conta automaticamente</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              Forçar conta: {c.apelido}
            </option>
          ))}
        </select>
        <Botao onClick={importarTudo} disabled={rodando || pendentes === 0}>
          {rodando ? "Importando…" : `Importar ${pendentes || ""} arquivo(s)`}
        </Botao>
        {concluidos && !rodando && (
          <Link href="/transacoes?revisar=1" className="text-sm underline">
            Revisar transações
          </Link>
        )}
      </div>
    </Cartao>
  );
}
