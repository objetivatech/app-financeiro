# Arquitetura

## Visão geral

```
Navegador ──(Cloudflare Access + Tunnel)──► Next.js (VPS, Docker) ──► PostgreSQL (VPS, Docker)
                                                   │
                                                   └──► API do Claude (leitura de PDF/imagem, classificação, dicas)
```

- **Next.js 16 (App Router, TypeScript)** — telas e uma rota de importação (`/api/importar`). Componentes de servidor
  leem o banco direto; mutações via Server Actions.
- **PostgreSQL 16 + Drizzle ORM** — schema em `src/lib/db/schema.ts`, migrações em `drizzle/`.
- **Claude (Anthropic)** — via `@anthropic-ai/sdk`, com saída estruturada (schemas Zod) e fallback automático de
  modelo em caso de recusa (`fallbacks: "default"`).

A VPS (2 vCPU / 4 GB) roda app e banco com folga para um usuário. Rodar um modelo de IA local nessa máquina não vale a
pena: os modelos que cabem em 4 GB são lentos e fracos em português e em raciocínio financeiro.

## Pipeline de importação (`src/lib/importacao`)

1. `detectar.ts` — formato pela assinatura dos bytes (PDF, PNG, JPEG, WEBP, GIF, ZIP/XLSX, HEIC) e, para texto, OFX ou
   CSV. Formatos ainda não suportados recebem mensagem explicando o que fazer.
2. Leitura:
   - `parsers/ofx.ts` — OFX 1.x (SGML) e 2.x (XML); banco pelo `BANKID` (código COMPE) ou `ORG`.
   - `parsers/csv.ts` — heurístico: acha a linha de cabeçalho, mapeia colunas por sinônimos (data, descrição, valor,
     crédito/débito, D/C), entende valores no padrão brasileiro, Windows-1252, preâmbulos e faturas com sinal
     invertido. Reconhece assinaturas conhecidas (ex.: Nubank).
   - `ia/extrator.ts` — PDF, imagem ou CSV desconhecido vão para o Claude, que devolve o extrato no formato
     normalizado (`tipos.ts`).
3. `persistir.ts` — identifica/cria o titular (CPF/CNPJ do extrato) e a conta; grava a importação e as transações.

### Deduplicação

- **Arquivo:** SHA-256 do conteúdo; o mesmo arquivo não entra duas vezes.
- **Transação:** chave `(conta, data, valor, ordem da ocorrência daquele par no arquivo)`. É independente da
  descrição, então o mesmo mês importado em OFX e depois em PDF não duplica, e duas compras iguais no mesmo dia
  continuam sendo duas.

## Classificação (`src/lib/classificacao`)

Cada transação tem **escopo** (PF/PJ), **categoria** e **natureza** — a natureza é o diferencial PF×PJ:
`retirada_socio`, `pro_labore`, `distribuicao_lucros`, `aporte_socio`, `despesa_pessoal_na_pj`, `despesa_pj_na_pf`,
`transferencia_interna`, `pagamento_fatura`, `imposto`, `investimento`, `estorno`, `comum`.

Ordem de prioridade (uma etapa nunca sobrescreve outra de prioridade maior):

| Prioridade | Origem | Exemplo |
|---|---|---|
| 6 | usuário | correção manual |
| 5 | regra | "descrição contém NETFLIX → PF, Assinaturas" (criada a partir de correções) |
| 4 | transferência | mesmo valor saindo de uma conta e entrando em outra sua em até 3 dias |
| 3 | heurística | DAS do Simples, pagamento de fatura, pró-labore, aplicação/resgate |
| 2 | IA | categoria + escopo pela natureza do gasto, com confiança |
| 1 | conta | palpite inicial pelo escopo da conta |

Depois, `marcarMistura` sinaliza gasto PF em conta PJ (e vice-versa). Transferências PJ→PF viram `retirada_socio`
para você definir se foi pró-labore ou distribuição de lucros (o tratamento tributário é diferente).

## Painel e análise

`src/lib/consultas.ts` calcula os totais em SQL. Movimentações entre bolsos (transferências, faturas, investimentos,
retiradas e aportes) não contam como receita/despesa. `src/lib/ia/analise.ts` manda à IA só dados agregados (totais,
categorias, recorrentes, maiores saídas) e recebe diagnóstico, alertas, dicas e perguntas para o contador.

## Privacidade

| Vai para a API do Claude | Não vai |
|---|---|
| PDFs e imagens de extrato (para leitura) | CPF/CNPJ na classificação e nas dicas |
| Data, descrição, valor e tipo da conta (classificação) | Número de conta e agência na classificação e nas dicas |
| Totais e maiores saídas do mês (dicas) | Nada é enviado se a chave não estiver configurada |
