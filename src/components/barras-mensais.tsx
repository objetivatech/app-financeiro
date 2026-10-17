import { formatarMes, formatarMoeda } from "@/lib/formato";

/**
 * Mini gráfico de barras de uma única série mensal (um gráfico por medida: nunca dois eixos).
 * Barras finas com cantos arredondados só na ponta, linha de base em zero e tooltip no hover.
 */
export function BarrasMensais({
  titulo,
  dados,
  cor,
}: {
  titulo: string;
  dados: { mes: string; valor: number }[];
  cor: "pf" | "pj" | "alerta";
}) {
  const altura = 96;
  const maxAbs = Math.max(1, ...dados.map((d) => Math.abs(d.valor)));
  const temNegativo = dados.some((d) => d.valor < 0);
  const temPositivo = dados.some((d) => d.valor > 0);
  // Linha de base: no meio se houver positivos e negativos; embaixo se só positivos; em cima se só negativos.
  const base = temNegativo && temPositivo ? altura / 2 : temNegativo ? 0 : altura;
  const escala = (temNegativo && temPositivo ? altura / 2 : altura) / maxAbs;
  const corBarra = { pf: "bg-pf", pj: "bg-pj", alerta: "bg-alerta" }[cor];

  return (
    <figure>
      <figcaption className="mb-2 text-sm text-suave">{titulo}</figcaption>
      <div className="relative flex items-stretch gap-1.5" style={{ height: altura }}>
        <div className="pointer-events-none absolute inset-x-0 border-t border-borda" style={{ top: base }} />
        {dados.map((d) => {
          const h = Math.max(Math.abs(d.valor) * escala, d.valor === 0 ? 0 : 2);
          const positivo = d.valor >= 0;
          return (
            <div key={d.mes} className="group relative flex-1">
              <div
                className={`absolute inset-x-[18%] ${corBarra} ${positivo ? "rounded-t" : "rounded-b"}`}
                style={positivo ? { bottom: altura - base, height: h } : { top: base, height: h }}
              />
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background group-hover:block">
                {formatarMes(d.mes)}: {formatarMoeda(d.valor)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 text-[11px] text-suave">
        {dados.map((d) => (
          <span key={d.mes} className="flex-1 text-center">
            {formatarMes(d.mes).split("/")[0]}
          </span>
        ))}
      </div>
    </figure>
  );
}
