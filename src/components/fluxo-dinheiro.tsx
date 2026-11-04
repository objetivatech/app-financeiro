import { formatarMoeda } from "@/lib/formato";

/**
 * Diagrama de fluxo (Sankey) em SVG, renderizado no servidor: de onde o dinheiro veio e para onde
 * foi. Cada faixa tem espessura proporcional ao valor; passar o mouse mostra o valor exato
 * (<title>), e os nós têm rótulo direto com o valor, então a cor nunca é a única pista.
 */
export interface NoFluxo {
  id: string;
  rotulo: string;
  coluna: 0 | 1 | 2 | 3;
  cor: "pj" | "pf" | "neutro" | "positivo";
}

export interface LigacaoFluxo {
  de: string;
  para: string;
  valor: number;
}

const LARGURA = 900;
const ALTURA_UTIL = 300;
const LARGURA_NO = 12;
const ESPACO = 22;
/** Espaço acima do primeiro nó para o rótulo dos nós intermediários. */
const TOPO = 34;
const X = [150, 330, 560, 750];
const CORES: Record<NoFluxo["cor"], string> = {
  pj: "var(--pj)",
  pf: "var(--pf)",
  neutro: "var(--suave)",
  positivo: "var(--positivo)",
};

export function FluxoDinheiro({ nos, ligacoes, titulo }: { nos: NoFluxo[]; ligacoes: LigacaoFluxo[]; titulo: string }) {
  const validas = ligacoes.filter((l) => l.valor > 0);
  const valorNo = new Map<string, number>();
  for (const n of nos) {
    const entra = validas.filter((l) => l.para === n.id).reduce((s, l) => s + l.valor, 0);
    const sai = validas.filter((l) => l.de === n.id).reduce((s, l) => s + l.valor, 0);
    valorNo.set(n.id, Math.max(entra, sai));
  }
  const visiveis = nos.filter((n) => (valorNo.get(n.id) ?? 0) > 0);
  if (visiveis.length === 0) return <p className="text-sm text-suave">Sem movimento classificado neste mês.</p>;

  const colunas = [0, 1, 2, 3].map((c) => visiveis.filter((n) => n.coluna === c));
  const maiorColuna = Math.max(...colunas.map((col) => col.reduce((s, n) => s + valorNo.get(n.id)!, 0)));
  const maisNos = Math.max(...colunas.map((c) => c.length));
  const escala = (ALTURA_UTIL - ESPACO * Math.max(0, maisNos - 1)) / maiorColuna;
  // Altura mínima de 2px para valores pequenos continuarem visíveis.
  const altura = (v: number) => Math.max(2, v * escala);

  const posicao = new Map<string, { y: number; h: number; saida: number; entrada: number }>();
  let alturaTotal = 0;
  for (const col of colunas) {
    // Cada coluna começa na altura do nó mais alto que a alimenta: as faixas ficam quase retas.
    const origens = validas.filter((l) => col.some((n) => n.id === l.para)).map((l) => posicao.get(l.de)?.y ?? 0);
    let y = TOPO + (origens.length ? Math.min(...origens) - TOPO : 0);
    col.forEach((n, i) => {
      // Nó com saídas leva o rótulo acima: abre espaço para não encostar no nó de cima.
      if (i > 0 && validas.some((l) => l.de === n.id)) y += 30;
      const h = altura(valorNo.get(n.id)!);
      posicao.set(n.id, { y, h, saida: y, entrada: y });
      y += h + ESPACO;
    });
    alturaTotal = Math.max(alturaTotal, y);
  }
  const ordem = new Map(visiveis.map((n, i) => [n.id, i]));
  const desenho = [...validas]
    .filter((l) => posicao.has(l.de) && posicao.has(l.para))
    .sort((a, b) => ordem.get(a.de)! - ordem.get(b.de)! || ordem.get(a.para)! - ordem.get(b.para)!)
    .map((l) => {
      const origem = nos.find((n) => n.id === l.de)!;
      const destino = nos.find((n) => n.id === l.para)!;
      const po = posicao.get(l.de)!;
      const pd = posicao.get(l.para)!;
      const h = altura(l.valor);
      const x0 = X[origem.coluna] + LARGURA_NO;
      const x1 = X[destino.coluna];
      const y0 = po.saida;
      const y1 = pd.entrada;
      po.saida += h;
      pd.entrada += h;
      const xm = (x0 + x1) / 2;
      const d = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h} Z`;
      return { l, d, cor: CORES[destino.cor === "neutro" ? origem.cor : destino.cor], origem, destino };
    });

  return (
    <figure>
      {/* No celular o diagrama mantém um tamanho legível e rola de lado dentro do quadro. */}
      <div className="-mx-1 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${LARGURA} ${alturaTotal}`} className="w-full min-w-[680px]" role="img" aria-label={titulo}>
        {desenho.map(({ l, d, cor, origem, destino }) => (
          <path key={`${l.de}-${l.para}`} d={d} fill={cor} opacity={0.22} className="transition-opacity hover:opacity-50">
            <title>{`${origem.rotulo} → ${destino.rotulo}: ${formatarMoeda(l.valor)}`}</title>
          </path>
        ))}
        {visiveis.map((n) => {
          const p = posicao.get(n.id)!;
          const esquerda = n.coluna === 0;
          // Nó que tem saídas (Empresa, Você): rótulo acima, para não ficar sobre as faixas.
          const intermediario = !esquerda && validas.some((l) => l.de === n.id);
          const tx = esquerda ? X[0] - 8 : intermediario ? X[n.coluna] + LARGURA_NO / 2 : X[n.coluna] + LARGURA_NO + 8;
          const ty = intermediario ? p.y - 22 : p.y + p.h / 2;
          const ancora = esquerda ? "end" : intermediario ? "middle" : "start";
          return (
            <g key={n.id}>
              <rect x={X[n.coluna]} y={p.y} width={LARGURA_NO} height={p.h} rx={3} fill={CORES[n.cor]}>
                <title>{`${n.rotulo}: ${formatarMoeda(valorNo.get(n.id)!)}`}</title>
              </rect>
              <text x={tx} y={ty - 2} textAnchor={ancora} className="fill-foreground text-[13px] font-medium">
                {n.rotulo}
              </text>
              <text x={tx} y={ty + 13} textAnchor={ancora} className="numero fill-suave text-[12px]">
                {formatarMoeda(valorNo.get(n.id)!)}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <details className="mt-2 text-xs text-suave">
        <summary className="cursor-pointer">ver em tabela</summary>
        <table className="mt-2 w-full">
          <tbody>
            {desenho.map(({ l, origem, destino }) => (
              <tr key={`${l.de}-${l.para}`} className="border-b border-borda">
                <td className="py-1">
                  {origem.rotulo} → {destino.rotulo}
                </td>
                <td className="numero py-1 text-right">{formatarMoeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
