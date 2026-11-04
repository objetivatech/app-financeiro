import type { ReactNode } from "react";
import { formatarMoeda } from "@/lib/formato";

export function Cartao({ titulo, children, className = "" }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-borda bg-superficie p-4 ${className}`}>
      {titulo && <h2 className="mb-3 text-sm font-medium text-suave">{titulo}</h2>}
      {children}
    </section>
  );
}

export function Valor({ centavos, sinal = false, className = "" }: { centavos: number; sinal?: boolean; className?: string }) {
  const cor = !sinal ? "" : centavos > 0 ? "text-positivo" : centavos < 0 ? "text-negativo" : "";
  return <span className={`numero ${cor} ${className}`}>{formatarMoeda(centavos)}</span>;
}

export function SeloEscopo({ escopo }: { escopo: "PF" | "PJ" | "misto" | null }) {
  if (!escopo) return <span className="rounded border border-dashed border-borda px-1.5 py-0.5 text-xs text-suave">?</span>;
  const estilo =
    escopo === "PF"
      ? "bg-pf/10 text-pf"
      : escopo === "PJ"
        ? "bg-pj/10 text-pj"
        : "bg-foreground/5 text-suave";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${estilo}`}>{escopo === "misto" ? "Misto" : escopo}</span>;
}

export function Carregando() {
  return <p className="text-sm text-suave">Carregando…</p>;
}

export function Botao(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...resto } = props;
  return (
    <button
      {...resto}
      className={`rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50 ${className}`}
    />
  );
}

export const estiloCampo = "rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm";

/**
 * Indicador (KPI): número em destaque, com rótulo e uma linha de contexto. O tom só reforça
 * o texto (nunca é a única pista): use junto com um detalhe que diga se está bom ou ruim.
 */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom,
  href,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: "bom" | "atencao" | "ruim";
  href?: string;
}) {
  const cor = tom === "bom" ? "text-positivo" : tom === "ruim" ? "text-negativo" : tom === "atencao" ? "text-alerta" : "";
  const icone = tom === "bom" ? "✓ " : tom === "ruim" ? "⚠ " : tom === "atencao" ? "! " : "";
  const corpo = (
    <>
      <div className="text-xs text-suave">{rotulo}</div>
      <div className={`numero mt-0.5 text-xl font-semibold ${cor}`}>{valor}</div>
      {detalhe && (
        <div className="mt-0.5 text-xs text-suave">
          {icone && <span className={cor}>{icone}</span>}
          {detalhe}
        </div>
      )}
    </>
  );
  const estilo = "block rounded-lg border border-borda bg-superficie p-3";
  return href ? (
    <a href={href} className={`${estilo} hover:border-foreground/30`}>
      {corpo}
    </a>
  ) : (
    <div className={estilo}>{corpo}</div>
  );
}

/** Linha "rótulo ........ valor" de demonstrativos (DRE, resumo do mês). */
export function LinhaValor({ rotulo, centavos, nivel = 0, destaque = false, sinal = false }: { rotulo: ReactNode; centavos: number; nivel?: 0 | 1; destaque?: boolean; sinal?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1 ${destaque ? "border-t border-borda font-semibold" : ""} ${nivel ? "pl-4 text-suave" : ""}`}>
      <span>{rotulo}</span>
      <Valor centavos={centavos} sinal={sinal} />
    </div>
  );
}
