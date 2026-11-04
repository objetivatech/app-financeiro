"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

/** Menu agrupado por assunto. Os três painéis vêm primeiro: visão integrada, pessoal e empresa. */
export const GRUPOS_MENU = [
  {
    titulo: "Painéis",
    links: [
      { href: "/", rotulo: "Consolidado", detalhe: "PF + PJ" },
      { href: "/pf", rotulo: "Pessoal", detalhe: "PF", cor: "text-pf" },
      { href: "/pj", rotulo: "Empresa", detalhe: "PJ", cor: "text-pj" },
    ],
  },
  {
    titulo: "Consultor",
    links: [
      { href: "/consultor", rotulo: "Conversar" },
      { href: "/avisos", rotulo: "Avisos", contador: true },
    ],
  },
  {
    titulo: "Dia a dia",
    links: [
      { href: "/transacoes", rotulo: "Transações" },
      { href: "/pagar", rotulo: "A pagar e dívidas" },
      { href: "/receber", rotulo: "A receber" },
      { href: "/cartoes", rotulo: "Cartões" },
      { href: "/fluxo", rotulo: "Fluxo de caixa" },
    ],
  },
  {
    titulo: "Empresa",
    links: [{ href: "/impostos", rotulo: "Impostos e Fator R" }],
  },
  {
    titulo: "Dados",
    links: [
      { href: "/importar", rotulo: "Importar" },
      { href: "/contas", rotulo: "Contas" },
      { href: "/integracoes", rotulo: "Integrações" },
    ],
  },
  {
    titulo: "Sistema",
    links: [
      { href: "/configuracoes", rotulo: "Configurações" },
      { href: "/ajuda", rotulo: "Ajuda" },
    ],
  },
] as const;

function ativo(caminho: string, href: string): boolean {
  return href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(`${href}/`);
}

export function Menu({ contadorAvisos }: { contadorAvisos?: ReactNode }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Menu principal" className="space-y-4 text-sm">
      {GRUPOS_MENU.map((g) => (
        <div key={g.titulo}>
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-suave">{g.titulo}</div>
          <ul>
            {g.links.map((l) => {
              const marcado = ativo(caminho, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={marcado ? "page" : undefined}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 ${marcado ? "bg-foreground/[0.07] font-medium text-foreground" : "text-suave hover:bg-foreground/[0.04] hover:text-foreground"}`}
                  >
                    <span>{l.rotulo}</span>
                    {"detalhe" in l && <span className={`text-xs ${"cor" in l ? l.cor : "text-suave"}`}>{l.detalhe}</span>}
                    {"contador" in l && contadorAvisos}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Título da página atual, para a barra do celular. */
export function TituloAtual() {
  const caminho = usePathname();
  for (const g of GRUPOS_MENU) for (const l of g.links) if (ativo(caminho, l.href)) return <span>{l.rotulo}</span>;
  return null;
}

/** Menu do celular: recolhido no topo; fecha sozinho ao escolher uma página. */
export function MenuCelular({ marca, rodape, contadorAvisos }: { marca: ReactNode; rodape: ReactNode; contadorAvisos?: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <details open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
        {marca}
        <span className="flex items-center gap-2 text-suave">
          <TituloAtual /> <span aria-hidden className="text-lg leading-none">☰</span>
          <span className="sr-only">Abrir menu</span>
        </span>
      </summary>
      <div
        className="border-t border-borda px-2 py-3"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setAberto(false);
        }}
      >
        <Menu contadorAvisos={contadorAvisos} />
        <div className="mt-3 px-2">{rodape}</div>
      </div>
    </details>
  );
}

/** Botão flutuante para chamar o consultor de qualquer tela. */
export function BotaoConsultor() {
  const caminho = usePathname();
  if (caminho.startsWith("/consultor")) return null;
  return (
    <Link
      href="/consultor"
      className="fixed bottom-4 right-4 z-40 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-lg hover:opacity-90"
      title="Conversar com o consultor"
    >
      Consultor
    </Link>
  );
}
