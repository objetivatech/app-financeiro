import { formatarMoeda } from "@/lib/formato";
import { EsquemaAnalise } from "@/lib/ia/analise";

export function AnaliseSalva({ conteudo }: { conteudo: string }) {
  const lido = EsquemaAnalise.safeParse(JSON.parse(conteudo));
  if (!lido.success) return <p className="text-sm text-suave">Análise salva em formato antigo. Gere outra.</p>;
  const a = lido.data;
  const corGravidade = { alta: "text-negativo", media: "text-alerta", baixa: "text-suave" } as const;
  return (
    <div className="space-y-4 text-sm">
      <p>{a.resumo}</p>
      {a.alertas.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Alertas</h3>
          <ul className="space-y-2">
            {a.alertas.map((al, i) => (
              <li key={i}>
                <span className={`mr-1 text-xs font-medium uppercase ${corGravidade[al.gravidade]}`}>{al.gravidade}</span>
                <strong>{al.titulo}.</strong> {al.detalhe}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.dicas.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Dicas</h3>
          <ul className="space-y-2">
            {a.dicas.map((d, i) => (
              <li key={i}>
                <strong>{d.titulo}.</strong> {d.detalhe}{" "}
                <span className="text-suave">→ {d.acao}</span>
                {d.economia_mensal_estimada ? (
                  <span className="ml-1 text-positivo">(~{formatarMoeda(d.economia_mensal_estimada * 100)}/mês)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.perguntas_para_o_contador.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Perguntas para levar ao contador</h3>
          <ul className="ml-5 list-disc space-y-1">
            {a.perguntas_para_o_contador.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
