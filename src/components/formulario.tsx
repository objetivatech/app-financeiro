"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/** O que uma ação de formulário pode devolver: nada (deu certo), uma mensagem de sucesso ou um erro. */
export type RetornoAcao = void | null | { ok?: string; erro?: string };
type Estado = { ok?: string; erro?: string; em: number } | null;

/** Traduz falhas de rede/servidor em algo que dá para resolver. */
export function explicarErro(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : String(erro);
  if (/Server Action|was not found|failed-to-find-server-action/i.test(msg))
    return "O app foi atualizado depois que esta página abriu. Recarregue a página (F5) e tente de novo.";
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  return "O servidor não conseguiu concluir. Recarregue a página e tente de novo; se continuar, veja os logs (docker compose logs app).";
}

/**
 * Formulário ligado a uma ação do servidor que sempre dá retorno: o botão mostra "Salvando…",
 * e ao final aparece "Salvo" (ou a mensagem da ação) ou o erro. Nada de clique sem resposta.
 */
export function Formulario({
  acao,
  children,
  className,
  mensagemOk = "Salvo.",
  aoConcluir,
  retornoEmLinha = false,
}: {
  acao: (fd: FormData) => Promise<RetornoAcao>;
  children: React.ReactNode;
  className?: string;
  mensagemOk?: string | null;
  aoConcluir?: () => void;
  retornoEmLinha?: boolean;
}) {
  const [estado, executar] = useActionState(async (_: Estado, fd: FormData): Promise<Estado> => {
    try {
      const r = await acao(fd);
      if (r && r.erro) return { erro: r.erro, em: Date.now() };
      aoConcluir?.();
      const ok = (r && r.ok) || mensagemOk;
      return ok ? { ok, em: Date.now() } : null;
    } catch (erro) {
      console.error(erro);
      return { erro: explicarErro(erro), em: Date.now() };
    }
  }, null);
  return (
    <form action={executar} className={className}>
      {children}
      <Retorno estado={estado} emLinha={retornoEmLinha} />
    </form>
  );
}

function Retorno({ estado, emLinha }: { estado: Estado; emLinha: boolean }) {
  // A mensagem de sucesso some sozinha; a de erro fica até a próxima tentativa.
  const [ocultoEm, setOcultoEm] = useState<number | null>(null);
  useEffect(() => {
    if (!estado || estado.erro) return;
    const t = setTimeout(() => setOcultoEm(estado.em), 5000);
    return () => clearTimeout(t);
  }, [estado]);
  if (!estado || ocultoEm === estado.em) return null;
  const Tag = emLinha ? "span" : "p";
  return (
    <Tag role={estado.erro ? "alert" : "status"} className={`text-sm ${estado.erro ? "text-negativo" : "text-positivo"}`}>
      {estado.erro ?? `✓ ${estado.ok}`}
    </Tag>
  );
}

const ESTILOS = {
  padrao: "rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50",
  link: "underline disabled:opacity-50 disabled:no-underline",
} as const;

/** Botão de envio que se desativa e muda o texto enquanto a ação roda (evita clique duplo). */
export function BotaoEnviar({
  children,
  pendente = "Salvando…",
  variante = "padrao",
  className = "",
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendente?: string; variante?: keyof typeof ESTILOS }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...resto} disabled={pending || resto.disabled} aria-busy={pending} className={`${ESTILOS[variante]} ${className}`}>
      {pending ? pendente : children}
    </button>
  );
}

/** Para formulários com useActionState: uma falha do servidor vira mensagem de erro, não uma tela quebrada. */
export function seguro<E, R>(acao: (estado: E, fd: FormData) => Promise<R>) {
  return async (estado: E | R | { erro: string; ok?: undefined }, fd: FormData): Promise<R | { erro: string; ok?: undefined }> => {
    try {
      return await acao(estado as E, fd);
    } catch (erro) {
      console.error(erro);
      return { erro: explicarErro(erro) };
    }
  };
}
